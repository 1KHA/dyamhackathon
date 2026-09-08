import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TEAM_REGISTRATION_HIDDEN } from "@/lib/constants";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-bold">منصة إدارة الهاكاثون</CardTitle>
          <CardDescription className="text-lg mt-2">
            سجل فريقك أو قم بتسجيل الدخول للوصول إلى لوحة التحكم
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>فريق جديد؟</CardTitle>
                <CardDescription>
                  سجل فريقك للمشاركة في الهاكاثون
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!TEAM_REGISTRATION_HIDDEN && (
                  <Link href="/register-team">
                    <Button className="w-full">تسجيل الفريق</Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>مسجل بالفعل؟</CardTitle>
                <CardDescription>
                  قم بتسجيل الدخول للوصول إلى لوحة تحكم المشارك
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/login">
                  <Button className="w-full" variant="outline">تسجيل الدخول</Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          <div className="text-center pt-6 border-t">
            <h3 className="text-lg font-semibold mb-2">دخول المسؤول</h3>
            <Link href="/admin-hackton-dashboard">
              <Button variant="secondary">لوحة تحكم المسؤول</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
