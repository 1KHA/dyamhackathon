"use client";

import { useState, useEffect, useRef, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useToast } from "../../../components/ui/use-toast";

interface MentorRouteGuardProps {
  children: ReactNode;
}

export default function MentorRouteGuard({ children }: MentorRouteGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [authorized, setAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Held in a ref, NOT state: as state it was both a useEffect dependency and
  // written inside that effect, so every failed check re-triggered the effect
  // — and because it was also reset to 0 at the top of each run, the
  // "too many attempts" circuit breaker could never trip. That was an
  // infinite loop of /api/mentor/me + /api/logout + router.push('/login').
  const redirectAttemptsRef = useRef(0);

  // Function to clear auth cookies
  const clearAuthCookies = async () => {
    try {
      // Call logout endpoint to clear server-side session/cookies
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
      });
      console.log('🍪 MentorRouteGuard - Auth cookies cleared');
    } catch (error) {
      console.error('Error clearing auth cookies:', error);
    }
  };

  useEffect(() => {
    // Guards against setting state after unmount (the redirect unmounts us)
    let cancelled = false;

    // Authentication check function
    const authCheck = async () => {
      try {
        // Prevent infinite redirect loops
        if (redirectAttemptsRef.current > 2) {
          console.log('⚠️ MentorRouteGuard - Too many redirect attempts, clearing auth state');
          await clearAuthCookies();
          if (!cancelled) {
            setIsLoading(false);
            setAuthorized(false);
          }
          return;
        }

        // Check if user is authenticated as mentor
        const response = await fetch('/api/mentor/me', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Include cookies
        });

        console.log('🔍 MentorRouteGuard - Response status:', response.status);

        if (!response.ok) {
          console.log('❌ MentorRouteGuard - Response not OK:', response.status, response.statusText);
          
          // Clear auth cookies on 401 Unauthorized
          if (response.status === 401) {
            await clearAuthCookies();
          }
          
          throw new Error('غير مصرح. هذه الخدمة متاحة للموجهين فقط.');
        }

        const data = await response.json();
        
        console.log('🔍 MentorRouteGuard - Response data:', data);
        
        // Verify the user is a mentor (updated to match new response format)
        if (data.success && data.role === 'mentor') {
          console.log('✅ MentorRouteGuard - Mentor authorization successful');
          redirectAttemptsRef.current = 0; // reset only on success
          if (!cancelled) setAuthorized(true);
        } else {
          console.log('❌ MentorRouteGuard - Authorization failed:', { success: data.success, role: data.role });
          await clearAuthCookies();
          throw new Error('غير مصرح. هذه الخدمة متاحة للموجهين فقط.');
        }
      } catch (error: any) {
        if (cancelled) return;
        setAuthorized(false);
        toast({
          title: "خطأ في الصلاحيات",
          description: error.message || "غير مصرح. هذه الخدمة متاحة للموجهين فقط.",
          variant: "destructive",
        });

        // Increment redirect attempts and redirect to login
        redirectAttemptsRef.current += 1;
        router.push("/login");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    // Check authentication on route change
    authCheck();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, toast]);

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">جاري التحقق من صلاحيات الموجه...</p>
        </div>
      </div>
    );
  }

  // If not authorized, show nothing (will redirect)
  if (!authorized) {
    return null;
  }

  // If authorized, render children
  return <>{children}</>;
}
