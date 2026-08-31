'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { REGISTRATION_CLOSED } from '@/lib/constants'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CHALLENGES } from '@/lib/challenges'
import { Checkbox } from '@/../../components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useToast } from '@/../../components/ui/use-toast'
import Loader from '@/components/ui/loader'

interface Participant {
  fullName: string
  contactNumber: string
  email: string
  gender: string
  isUniversityStudent: boolean
  universityMajor: string
  university: string
  professionalField: string
  city: string
  canAttendHackathon: boolean
}

const initialParticipantState: Participant = {
  fullName: '',
  contactNumber: '',
  email: '',
  gender: '',
  isUniversityStudent: false,
  universityMajor: '',
  university: '',
  professionalField: '',
  city: '',
  canAttendHackathon: false,
}

const initialFormState = {
  registrationType: '', // 'individual' or 'team'
  teamName: '',
  hackathonTrack: '',
  ideaDescription: '',
  hearAboutUs: '',
  agreeToTerms: false,
  leaderInfo: initialParticipantState,
  members: Array(1).fill(null).map(() => ({ ...initialParticipantState })),
  memberCount: 2, // Default to 2 members (leader + 1)
}

type FormState = typeof initialFormState;

export default function RegisterTeamPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [mounted, setMounted] = useState(false)
  const [showLoader, setShowLoader] = useState(true)
  const [loaderVisible, setLoaderVisible] = useState(true)
  const [contentVisible, setContentVisible] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)

  // Initialize with default state to prevent hydration issues
  const [formState, setFormState] = useState<FormState>(initialFormState)

  // Loader timer effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoaderVisible(false);
      // Start content fade in after loader starts fading out
      setTimeout(() => {
        setShowLoader(false);
        setContentVisible(true);
      }, 300); // Wait for loader fade out to complete
    }, 1500); // 1.5 seconds

    return () => clearTimeout(timer);
  }, []);

  // Load from localStorage after component mounts
  useEffect(() => {
    setMounted(true)
    try {
      const savedState = localStorage.getItem('registrationForm')
      if (savedState) {
        setFormState(JSON.parse(savedState))
      }
    } catch (error) {
      console.error('Failed to parse form state from localStorage', error)
    }
  }, [])

  // Save to localStorage when form state changes (only after mounted)
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('registrationForm', JSON.stringify(formState))
    }
  }, [formState, mounted])

  const handleStateChange = (field: keyof FormState, value: any) => {
    setFormState((prev: FormState) => ({ ...prev, [field]: value }))
  }

  const handleLeaderChange = (field: keyof Participant, value: string | boolean) => {
    setFormState((prev: FormState) => ({
      ...prev,
      leaderInfo: { ...prev.leaderInfo, [field]: value },
    }))
  }

  const handleMemberChange = (index: number, field: keyof Participant, value: string | boolean) => {
    setFormState((prev: FormState) => {
      const newMembers = [...prev.members]
      newMembers[index] = { ...newMembers[index], [field]: value }
      return { ...prev, members: newMembers }
    })
  }

  const handleMemberCountChange = (value: string) => {
    const count = parseInt(value)
    setFormState((prev: FormState) => {
      const currentMembers = prev.members
      if (count > currentMembers.length) {
        const newMembers = [...currentMembers]
        for (let i = currentMembers.length; i < count - 1; i++) { // count - 1 because leader is separate
          newMembers.push({ ...initialParticipantState })
        }
        return { ...prev, memberCount: count, members: newMembers }
      }
      return { ...prev, memberCount: count, members: currentMembers.slice(0, count - 1) }
    })
  }

  const handleRegistrationTypeChange = (value: string) => {
    setFormState((prev: FormState) => ({
      ...prev,
      registrationType: value,
      teamName: value === 'individual' ? '' : prev.teamName,
      ideaDescription: value === 'individual' ? '' : prev.ideaDescription,
      hearAboutUs: value === 'individual' ? '' : prev.hearAboutUs,
    }))
  }

  // Email validation function
  const isValidEmail = (email: string | undefined) => {
    if (!email) return false
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // Validation function to check if all required fields are filled
  const isFormValid = () => {
    // Check registration type and hackathon track
    if (!formState.registrationType || !formState.hackathonTrack || !formState.agreeToTerms) {
      return false
    }

    // Check team fields if team registration
    if (formState.registrationType === 'team') {
      if (!formState.teamName || !formState.teamName.trim() || 
          !formState.ideaDescription || !formState.ideaDescription.trim() || 
          !formState.hearAboutUs || !formState.hearAboutUs.trim()) {
        return false
      }
    }

    // Check leader info
    const leader = formState.leaderInfo
    if (!leader.fullName || !leader.fullName.trim() || 
        !leader.contactNumber || leader.contactNumber.length !== 10 || 
        !leader.email || !leader.email.trim() || 
        !isValidEmail(leader.email) || 
        !leader.gender || 
        !leader.universityMajor || !leader.universityMajor.trim() || 
        !leader.university || !leader.university.trim() || 
        !leader.professionalField || !leader.professionalField.trim() || 
        !leader.city || !leader.city.trim()) {
      return false
    }

    // Check team members if team registration
    if (formState.registrationType === 'team') {
      for (let i = 0; i < formState.memberCount - 1; i++) {
        const member = formState.members[i]
        if (!member.fullName || !member.fullName.trim() || 
            !member.contactNumber || member.contactNumber.length !== 10 || 
            !member.email || !member.email.trim() || 
            !isValidEmail(member.email) || 
            !member.gender || 
            !member.universityMajor || !member.universityMajor.trim() || 
            !member.university || !member.university.trim() || 
            !member.professionalField || !member.professionalField.trim() || 
            !member.city || !member.city.trim()) {
          return false
        }
      }
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Validate phone numbers are exactly 10 digits
    if (!formState.leaderInfo.contactNumber || formState.leaderInfo.contactNumber.length !== 10) {
      toast({
        title: 'خطأ في رقم التواصل',
        description: 'يجب أن يكون رقم التواصل مكون من 10 أرقام بالضبط',
        variant: 'destructive',
      })
      setIsSubmitting(false)
      return
    }

    // Validate team members' phone numbers if team registration
    if (formState.registrationType === 'team') {
      for (let i = 0; i < formState.memberCount - 1; i++) {
        if (!formState.members[i].contactNumber || formState.members[i].contactNumber.length !== 10) {
          toast({
            title: 'خطأ في رقم التواصل',
            description: `يجب أن يكون رقم التواصل للعضو ${i + 1} مكون من 10 أرقام بالضبط`,
            variant: 'destructive',
          })
          setIsSubmitting(false)
          return
        }
      }
    }

    const formData = new FormData()
    
    // Add registration type and team info
    formData.append('registrationType', formState.registrationType)
    formData.append('isTeamRegistration', formState.registrationType === 'team' ? 'true' : 'false')
    
    // Hackathon track is required for both individual and team
    formData.append('hackathonTrack', formState.hackathonTrack)
    
    if (formState.registrationType === 'team') {
      formData.append('teamName', formState.teamName)
      formData.append('ideaDescription', formState.ideaDescription)
      formData.append('hearAboutUs', formState.hearAboutUs)
      formData.append('memberCount', formState.memberCount.toString())
    }

    // Add participant data
    formData.append('leaderInfo', JSON.stringify(formState.leaderInfo))
    if (formState.registrationType === 'team') {
      formData.append('members', JSON.stringify(formState.members.slice(0, formState.memberCount - 1)))
    }

    if (attachmentFile) {
      formData.append('attachment', attachmentFile)
    }

    try {
      const response = await fetch('/api/register-team', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (response.ok) {
        localStorage.removeItem('registrationForm')
        setShowCelebration(true)
        // Redirect after 3 seconds
        setTimeout(() => {
          router.push('/')
        }, 3000)
      } else {
        toast({
          title: 'خطأ',
          description: data.error || 'فشل إرسال النموذج',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'خطأ',
        description: 'حدث خطأ أثناء إرسال النموذج',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderParticipantFields = (
    participant: Participant,
    updateFn: (field: keyof Participant, value: string | boolean) => void,
    prefix: string
  ) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <Label htmlFor={`${prefix}-fullName`} className="text-base font-medium mb-2 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
          الاسم كاملًا
        </Label>
        <Input 
          id={`${prefix}-fullName`} 
          required 
          value={participant.fullName || ''} 
          onChange={(e) => updateFn('fullName', e.target.value)}
          className={`h-11 border-2 ${participant.fullName && participant.fullName.trim() ? 'border-gray-200 focus:border-[#2F44DC]' : 'border-red-300 focus:border-red-500'} rounded-lg`}
          style={{ fontFamily: 'PingAR, Arial, sans-serif' }}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-contactNumber`} className="text-base font-medium mb-2 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
          رقم التواصل
        </Label>
        <Input 
          id={`${prefix}-contactNumber`} 
          type="tel" 
          required 
          value={participant.contactNumber} 
          onChange={(e) => {
            const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10)
            updateFn('contactNumber', digitsOnly)
          }} 
          dir="ltr"
          className={`h-11 border-2 ${participant.contactNumber && participant.contactNumber.length === 10 ? 'border-gray-200 focus:border-[#2F44DC]' : 'border-red-300 focus:border-red-500'} rounded-lg`}
          style={{ fontFamily: 'PingAR, Arial, sans-serif' }}
          placeholder="0501234567"
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-email`} className="text-base font-medium mb-2 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
          البريد الإلكتروني
        </Label>
        <Input 
          id={`${prefix}-email`} 
          type="email" 
          required 
          value={participant.email} 
          onChange={(e) => updateFn('email', e.target.value)} 
          dir="ltr"
          className={`h-11 border-2 ${participant.email && participant.email.trim() && isValidEmail(participant.email) ? 'border-gray-200 focus:border-[#2F44DC]' : 'border-red-300 focus:border-red-500'} rounded-lg`}
          style={{ fontFamily: 'PingAR, Arial, sans-serif' }}
          placeholder="example@email.com"
        />
      </div>
      <div>
        <Label className="text-base font-medium mb-2 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
        جنس المتقدم
        </Label>
        <Select required onValueChange={(value) => updateFn('gender', value)} value={participant.gender}>
          <SelectTrigger className={`h-11 border-2 ${participant.gender ? 'border-gray-200 focus:border-[#2F44DC]' : 'border-red-300 focus:border-red-500'} rounded-lg text-right`} style={{ fontFamily: 'PingAR, Arial, sans-serif' }} dir="rtl">
            <SelectValue placeholder="اختر الجنس..." />
          </SelectTrigger>
          <SelectContent className="text-right" dir="rtl">
            <SelectItem value="male" className="text-right" style={{ fontFamily: 'PingAR, Arial, sans-serif' }}>ذكر</SelectItem>
            <SelectItem value="female" className="text-right" style={{ fontFamily: 'PingAR, Arial, sans-serif' }}>أنثى</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <Checkbox 
          id={`${prefix}-isUniversityStudent`} 
          checked={participant.isUniversityStudent} 
          onCheckedChange={(checked: boolean | 'indeterminate') => updateFn('isUniversityStudent', !!checked)}
          className="border-[#2F44DC] data-[state=checked]:bg-[#2F44DC]"
        />
        <Label htmlFor={`${prefix}-isUniversityStudent`} className="text-base cursor-pointer" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
          هل أنت طالب في الجامعة؟
        </Label>
      </div>
      <div>
        <Label htmlFor={`${prefix}-universityMajor`} className="text-base font-medium mb-2 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
          اذكر تخصصك الجامعي
        </Label>
        <Input 
          id={`${prefix}-universityMajor`} 
          required 
          value={participant.universityMajor} 
          onChange={(e) => updateFn('universityMajor', e.target.value)}
          className={`h-11 border-2 ${participant.universityMajor && participant.universityMajor.trim() ? 'border-gray-200 focus:border-[#2F44DC]' : 'border-red-300 focus:border-red-500'} rounded-lg`}
          style={{ fontFamily: 'PingAR, Arial, sans-serif' }}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-university`} className="text-base font-medium mb-2 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
          اذكر جامعتك
        </Label>
        <Input 
          id={`${prefix}-university`} 
          required 
          value={participant.university} 
          onChange={(e) => updateFn('university', e.target.value)}
          className={`h-11 border-2 ${participant.university && participant.university.trim() ? 'border-gray-200 focus:border-[#2F44DC]' : 'border-red-300 focus:border-red-500'} rounded-lg`}
          style={{ fontFamily: 'PingAR, Arial, sans-serif' }}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}-professionalField`} className="text-base font-medium mb-2 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
          ماهو مجالك المهني؟
        </Label>
        <Select required onValueChange={(value) => updateFn('professionalField', value)} value={participant.professionalField}>
          <SelectTrigger className={`h-11 border-2 ${participant.professionalField ? 'border-gray-200 focus:border-[#2F44DC]' : 'border-red-300 focus:border-red-500'} rounded-lg text-right`} style={{ fontFamily: 'PingAR, Arial, sans-serif' }} dir="rtl">
            <SelectValue placeholder="اختر مجالك المهني..." />
          </SelectTrigger>
          <SelectContent className="text-right" dir="rtl">
            <SelectItem value="ذكاء اصناعي" className="text-right" style={{ fontFamily: 'PingAR, Arial, sans-serif' }}>ذكاء اصناعي</SelectItem>
            <SelectItem value="علم البيانات" className="text-right" style={{ fontFamily: 'PingAR, Arial, sans-serif' }}>علم البيانات</SelectItem>
            <SelectItem value="برمجة" className="text-right" style={{ fontFamily: 'PingAR, Arial, sans-serif' }}>برمجة</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor={`${prefix}-city`} className="text-base font-medium mb-2 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
          أدخل رابط الGithub 
        </Label>
        <Input 
          id={`${prefix}-city`} 
          required 
          value={participant.city} 
          onChange={(e) => updateFn('city', e.target.value)}
          className={`h-11 border-2 ${participant.city && participant.city.trim() ? 'border-gray-200 focus:border-[#2F44DC]' : 'border-red-300 focus:border-red-500'} rounded-lg`}
          style={{ fontFamily: 'PingAR, Arial, sans-serif' }}
        />
      </div>
      <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <Checkbox 
          id={`${prefix}-canAttendHackathon`} 
          checked={participant.canAttendHackathon} 
          onCheckedChange={(checked: boolean | 'indeterminate') => updateFn('canAttendHackathon', !!checked)}
          className="border-[#2F44DC] data-[state=checked]:bg-[#2F44DC]"
        />
        <Label htmlFor={`${prefix}-canAttendHackathon`} className="text-base cursor-pointer" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
          هل تستطيع التواجد خلال فترة التحدي في مقر - وادي مكة؟
        </Label>
      </div>
    </div>
  )

  return (
    <>
      {/* Celebration Overlay */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-12 mx-4 max-w-2xl w-full text-center shadow-2xl animate-in fade-in zoom-in duration-500">
            <div className="text-8xl mb-6">🎉</div>
            <h1 className="text-5xl font-bold mb-6" style={{ color: '#2F44DC', fontFamily: 'PingAR, Arial, sans-serif' }}>
              تم التسجيل في التحدي بنجاح
            </h1>
            <p className="text-2xl mb-8" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
              شكرًا لك على التسجيل! سيتم التواصل معك قريبًا
            </p>
            <div className="flex justify-center space-x-4 text-4xl">
              <span className="animate-bounce">🎊</span>
              <span className="animate-bounce delay-100">✨</span>
              <span className="animate-bounce delay-200">🎉</span>
              <span className="animate-bounce delay-300">🎈</span>
            </div>
          </div>
        </div>
      )}

      {/* Loader with smooth fade out */}
      {showLoader && <Loader isVisible={loaderVisible} />}
      
      {/* Main content with smooth fade in */}
      <div 
        className={`min-h-screen transition-opacity duration-500 ${contentVisible ? 'opacity-100' : 'opacity-0'} ${showCelebration ? 'pointer-events-none' : ''}`}
        style={{ backgroundColor: '#2F44DC', fontFamily: 'PingAR, Arial, sans-serif' }}
      >
      
      {/* Form Section */}
      <div className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
        <Image
          src="/logo2.png"
          alt="miyahthone"
          width={224}
          height={224}
          priority
          className="mx-auto mb-8 w-48 h-auto"
        />
        <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-8 pt-10">
            <CardTitle className="text-4xl font-bold mb-4" style={{ color: '#2F44DC', fontFamily: 'PingAR, Arial, sans-serif' }}>
              نموذج تسجيل المشاركين
            </CardTitle>
            <CardDescription className="text-xl" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
              {REGISTRATION_CLOSED ? 'انتهى التسجيل في التحدي' : 'سجل للمشاركة في التحدي وكن جزءًا من التغيير'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-10 pb-10">
            {REGISTRATION_CLOSED ? (
              <div className="text-center py-12">
                <h2 className="text-5xl font-bold mb-6" style={{ color: '#2F44DC', fontFamily: 'PingAR, Arial, sans-serif' }}>
                  انتهى التسجيل
                </h2>
                <p className="text-2xl mb-8" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
                  نعتذر، لقد انتهت فترة التسجيل في التحدي
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-8">
              {/* Registration Type Selection */}
              <div className="bg-gray-50/50 p-6 rounded-xl border-2 border-gray-100 space-y-6">
                <h3 className="text-2xl font-bold pb-3 border-b-2 border-gray-200" style={{ color: '#2F44DC', fontFamily: 'PingAR, Arial, sans-serif' }}>
                  نوع المشاركة
                </h3>
                <div>
                  <Label className="text-lg font-medium mb-4 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
                    هل ستشارك كفريق؟
                  </Label>
                  <RadioGroup 
                    required 
                    value={formState.registrationType} 
                    onValueChange={handleRegistrationTypeChange} 
                    className="flex flex-col sm:flex-row gap-6 mt-4"
                  >
                    <div className="flex items-center space-x-3 p-4 border-2 border-gray-200 rounded-lg hover:border-[#2F44DC] transition-colors">
                      <RadioGroupItem value="individual" id="individual" className="border-[#2F44DC]" />
                      <Label htmlFor="individual" className="text-lg cursor-pointer" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
                        مشاركة فردية
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 p-4 border-2 border-gray-200 rounded-lg hover:border-[#2F44DC] transition-colors">
                      <RadioGroupItem value="team" id="team" className="border-[#2F44DC]" />
                      <Label htmlFor="team" className="text-lg cursor-pointer" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
                        مشاركة كفريق
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              {/* Hackathon Track Selection - Show for both individual and team */}
              {formState.registrationType && (
                <div className="bg-gray-50/50 p-6 rounded-xl border-2 border-gray-100 space-y-6">
                  <h3 className="text-2xl font-bold pb-3 border-b-2 border-gray-200" style={{ color: '#2F44DC', fontFamily: 'PingAR, Arial, sans-serif' }}>
                    مسار التحدي
                  </h3>
                  <div>
                    <Label className="text-lg font-medium mb-4 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
                      أي مسار من مسارات التحدي
                    </Label>
                    <Select 
                      required 
                      onValueChange={(value) => handleStateChange('hackathonTrack', value)} 
                      value={formState.hackathonTrack}
                    >
                      <SelectTrigger className="h-12 text-lg border-2 border-gray-200 focus:border-[#2F44DC] text-right" style={{ fontFamily: 'PingAR, Arial, sans-serif' }} dir="rtl">
                        <SelectValue placeholder="اختر المسار..." />
                      </SelectTrigger>
                      <SelectContent className="text-right" dir="rtl">
                        {CHALLENGES.map((challenge) => (
                          <SelectItem key={challenge} value={challenge} className="text-lg py-3 text-right" style={{ fontFamily: 'PingAR, Arial, sans-serif' }}>
                            {challenge}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Team Information - Only show if team registration */}
              {formState.registrationType === 'team' && (
                <div className="bg-gray-50/50 p-6 rounded-xl border-2 border-gray-100 space-y-6">
                  <h3 className="text-2xl font-bold pb-3 border-b-2 border-gray-200" style={{ color: '#2F44DC', fontFamily: 'PingAR, Arial, sans-serif' }}>
                    معلومات الفريق
                  </h3>
                  
                  <div>
                    <Label htmlFor="team-name" className="text-base font-medium mb-2 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
                      اسم الفريق
                    </Label>
                    <Input 
                      id="team-name" 
                      required 
                      value={formState.teamName} 
                      onChange={(e) => handleStateChange('teamName', e.target.value)}
                      className={`h-11 border-2 ${formState.teamName && formState.teamName.trim() ? 'border-gray-200 focus:border-[#2F44DC]' : 'border-red-300 focus:border-red-500'} rounded-lg`}
                      style={{ fontFamily: 'PingAR, Arial, sans-serif' }}
                    />
                  </div>

                  <div>
                    <Label htmlFor="idea-description" className="text-base font-medium mb-2 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
                     نبذة عن الفريق
                    </Label>
                    <Textarea 
                      id="idea-description" 
                      required 
                      value={formState.ideaDescription} 
                      onChange={(e) => handleStateChange('ideaDescription', e.target.value)} 
                      rows={4}
                      className={`border-2 ${formState.ideaDescription && formState.ideaDescription.trim() ? 'border-gray-200 focus:border-[#2F44DC]' : 'border-red-300 focus:border-red-500'} rounded-lg resize-none`}
                      style={{ fontFamily: 'PingAR, Arial, sans-serif' }}
                    />
                  </div>

                  <div>
                    <Label htmlFor="hear-about-us" className="text-base font-medium mb-2 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
                      من أين سمعت عنا
                    </Label>
                    <Input 
                      id="hear-about-us" 
                      required 
                      value={formState.hearAboutUs || ''} 
                      onChange={(e) => handleStateChange('hearAboutUs', e.target.value)}
                      className={`h-11 border-2 ${formState.hearAboutUs && formState.hearAboutUs.trim() ? 'border-gray-200 focus:border-[#2F44DC]' : 'border-red-300 focus:border-red-500'} rounded-lg`}
                      style={{ fontFamily: 'PingAR, Arial, sans-serif' }}
                    />
                  </div>

                  <div>
                    <Label htmlFor="member-count" className="text-base font-medium mb-2 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
                      عدد أعضاء الفريق (شامل القائد)
                    </Label>
                    <Select value={String(formState.memberCount)} onValueChange={handleMemberCountChange}>
                      <SelectTrigger className="h-11 border-2 border-gray-200 focus:border-[#2F44DC] rounded-lg text-right" style={{ fontFamily: 'PingAR, Arial, sans-serif' }} dir="rtl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="text-right" dir="rtl">
                        <SelectItem value="2" className="text-right" style={{ fontFamily: 'PingAR, Arial, sans-serif' }}>2 أعضاء</SelectItem>
                        <SelectItem value="3" className="text-right" style={{ fontFamily: 'PingAR, Arial, sans-serif' }}>3 أعضاء</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="attachments-file" className="text-base font-medium mb-2 block" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
                      إضافة مرفقات (اختياري)
                    </Label>
                    <Input 
                      id="attachments-file" 
                      type="file" 
                      onChange={(e) => setAttachmentFile(e.target.files ? e.target.files[0] : null)}
                      className="h-11 border-2 border-gray-200 focus:border-[#2F44DC] rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#2F44DC] file:text-white hover:file:bg-[#2436B0]"
                      style={{ fontFamily: 'PingAR, Arial, sans-serif' }}
                    />
                    <p className="text-sm mt-2" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
                      ارفاق المتوفر من شعار، ملف تعريفي، الخ.
                    </p>
                  </div>
                </div>
              )}

              {/* Participant Information */}
              {formState.registrationType && (
                <div className="bg-gray-50/50 p-6 rounded-xl border-2 border-gray-100 space-y-6">
                  <h3 className="text-2xl font-bold pb-3 border-b-2 border-gray-200" style={{ color: '#2F44DC', fontFamily: 'PingAR, Arial, sans-serif' }}>
                    {formState.registrationType === 'team' ? 'معلومات قائد الفريق' : 'معلوماتك الشخصية'}
                  </h3>
                  {renderParticipantFields(formState.leaderInfo, handleLeaderChange, 'leader')}
                </div>
              )}

              {/* Team Members Information - Only show if team registration */}
              {formState.registrationType === 'team' && formState.memberCount > 1 && (
                <div className="bg-gray-50/50 p-6 rounded-xl border-2 border-gray-100 space-y-6">
                  <h3 className="text-2xl font-bold pb-3 border-b-2 border-gray-200" style={{ color: '#2F44DC', fontFamily: 'PingAR, Arial, sans-serif' }}>
                    معلومات أعضاء الفريق
                  </h3>
                  {formState.members.slice(0, formState.memberCount - 1).map((member: Participant, index: number) => (
                    <div key={index} className="bg-white p-6 border-2 border-gray-200 rounded-xl space-y-4 shadow-sm">
                      <h4 className="font-bold text-xl mb-4" style={{ color: '#2F44DC', fontFamily: 'PingAR, Arial, sans-serif' }}>
                        العضو {index + 1}
                      </h4>
                      {renderParticipantFields(member, (field, value) => handleMemberChange(index, field, value), `member-${index}`)}
                    </div>
                  ))}
                </div>
              )}
              
              <div className="bg-gray-50/50 p-6 rounded-xl border-2 border-gray-100">
                <div className="flex items-center space-x-3">
                  <Checkbox 
                    id="terms" 
                    required 
                    checked={formState.agreeToTerms} 
                    onCheckedChange={(checked) => handleStateChange('agreeToTerms', !!checked)}
                    className="border-[#2F44DC] data-[state=checked]:bg-[#2F44DC]"
                  />
                  <Label htmlFor="terms" className="text-lg cursor-pointer" style={{ color: '#53AEF5', fontFamily: 'PingAR, Arial, sans-serif' }}>
                    أوافق على الشروط والأحكام
                  </Label>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full text-xl py-4 font-bold rounded-xl transition-all duration-300 hover:shadow-lg disabled:opacity-50" 
                style={{ 
                  backgroundColor: '#2F44DC', 
                  fontFamily: 'PingAR, Arial, sans-serif',
                  border: 'none'
                }}
                disabled={isSubmitting || !isFormValid()}
              >
                {isSubmitting ? 'جاري الإرسال...' : 'إرسال التسجيل'}
              </Button>
              </form>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
      
      </div>
    </>
  )
}
