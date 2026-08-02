'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '../../../components/ui/use-toast'
import { useAuth } from '@/contexts/auth-context'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { login, user, isLoading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })

  // Redirect if already authenticated
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      console.log('✅ User already logged in:', user.role);

      // Redirect based on user role
      if (user.role === 'participant') {
        router.push('/participant-dashboard');
      } else if (user.role === 'mentor') {
        router.push('/mentor-dashboard');
      } else if (user.role === 'admin') {
        router.push('/admin-hackton-dashboard');
      }
    }
  }, [user, authLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const result = await login(formData.email, formData.password)

      if (result.success) {
        toast({
          title: "نجح",
          description: "تم تسجيل الدخول بنجاح!",
        });

        // The auth context will update the user state
        // The useEffect above will handle the redirect based on user role
      } else {
        const message = result.error || 'بيانات الدخول غير صحيحة'
        // Inline message is the primary signal — it stays on screen until the
        // next attempt, unlike the toast which auto-dismisses after 5s
        setErrorMessage(message)
        toast({
          title: "خطأ",
          description: message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Login error:', error)
      const message = 'حدث خطأ أثناء تسجيل الدخول'
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

  // Show loading while checking auth on first load.
  // `isLoading` guards the submit path: login() flips the shared auth
  // `isLoading` too, and without this the form would be replaced by this
  // spinner mid-submit — hiding the form and any error it needs to show.
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
            تسجيل الدخول
          </CardTitle>
          <CardDescription className="text-center">
            أدخل بريدك الإلكتروني وكلمة المرور للوصول إلى لوحة التحكم
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
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                placeholder="example@email.com"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">كلمة المرور</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  نسيت كلمة المرور؟
                </Link>
              </div>
              <PasswordInput
                id="password"
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

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">ليس لديك حساب؟ </span>
            <Link href="/register-team" className="font-medium text-primary hover:underline">
              سجل فريقك
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
