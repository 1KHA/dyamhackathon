'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
// NOTE: this page previously used `showAdminToast`, but <AdminToaster /> is only
// mounted inside the admin dashboard layout — /admin-login sits outside it, so
// those toasts were dispatched into a void and no error was ever shown.
// The shadcn toaster IS mounted globally in the root layout, so use that.
import { useToast } from '../../../components/ui/use-toast'
import { useAuth } from '@/contexts/auth-context'
import { AlertCircle } from 'lucide-react'

export default function AdminLoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { user, isLoading: authLoading, checkAuth } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  })

  // Redirect if already logged in as admin
  useEffect(() => {
    const verifyAdminStatus = async () => {
      if (authLoading) return;
      
      try {
        // Directly check admin status with the API
        const response = await fetch('/api/admin/me', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });
        
        console.log('🔍 Admin login page - Admin check response status:', response.status);
        
        // If admin check is successful, redirect to dashboard
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.role === 'admin') {
            console.log('✅ Admin already logged in, redirecting to dashboard');
            router.push('/admin-hackton-dashboard');
            return;
          }
        }
        
        // If user is logged in but not as admin
        if (user && user.role !== 'admin') {
          console.log(`⚠️ User logged in with role: ${user.role}, but not admin`);
          const message = `أنت مسجل دخول كـ ${user.role}. يرجى تسجيل الخروج أولاً للدخول كمسؤول.`
          setErrorMessage(message)
          toast({
            title: "تحذير",
            description: message,
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };
    
    verifyAdminStatus();
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage(null)

    console.log('🔐 Admin login attempt:', { username: formData.username });

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
        credentials: 'include', // Include cookies
      })

      const data = await response.json()

      console.log('📡 Admin login response:', { 
        status: response.status, 
        success: data.success,
        hasUser: !!data.user 
      });

      if (response.ok && data.success) {
        toast({
          title: "نجح",
          description: "تم تسجيل الدخول كمسؤول بنجاح!",
        });

        console.log('✅ Admin login successful, checking auth and redirecting...');
        
        // Refresh auth context to get updated user data
        await checkAuth();
        
        // Redirect to admin dashboard
        router.push('/admin-hackton-dashboard');
      } else {
        console.log('❌ Admin login failed:', data.error);
        // /api/admin/login already returns Arabic error copy
        const message = data.error || "اسم المستخدم أو كلمة المرور غير صحيحة"
        setErrorMessage(message)
        toast({
          title: "خطأ",
          description: message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('❌ Admin login error:', error);
      const message = "حدث خطأ أثناء تسجيل الدخول"
      setErrorMessage(message)
      toast({
        title: "خطأ",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading while checking auth on first load (guarded by `isLoading` so
  // a submit in progress never replaces the form — and any error it shows)
  if (authLoading && !isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحقق من حالة تسجيل الدخول...</p>
        </div>
      </div>
    );
  }

  // Don't show login form if user is already logged in (will redirect)
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">جاري إعادة التوجيه...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Image
        src="/logo.png"
        alt="miyahthone"
        width={224}
        height={224}
        priority
        className="mb-6 w-56 h-auto"
      />
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            تسجيل دخول المسؤول
          </CardTitle>
          <CardDescription className="text-center">
            أدخل اسم المستخدم وكلمة المرور للوصول إلى لوحة تحكم المسؤول
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-4 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">اسم المستخدم</Label>
              <Input
                id="username"
                type="text"
                placeholder="admin1"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                dir="ltr"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
