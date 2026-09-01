"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/ar'; // Import Arabic locale
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { SLOT_STEP_MINUTES, SLOT_TIMESLOTS_PER_HOUR } from '@/lib/constants';
import { Button } from '../../../../components/ui/button';
import { useToast } from "../../../../components/ui/use-toast"

moment.locale('ar'); // Set moment to use Arabic
const localizer = momentLocalizer(moment);

interface Availability {
  id: string;
  start: Date;
  end: Date;
  title: string;
}

const AvailabilityPage = () => {
  const [events, setEvents] = useState<Availability[]>([]);
  const { toast } = useToast();
  const router = useRouter();
  const calendarRef = useRef<any>(null);
  
  // State for date selection
  const [selectedDate, setSelectedDate] = useState(moment());
  const [selectedYear, setSelectedYear] = useState(moment().year());
  const [selectedMonth, setSelectedMonth] = useState(moment().month());
  const [selectedDay, setSelectedDay] = useState(moment().date());
  
  // Generate years (current year - 5 to current year + 5)
  const currentYear = moment().year();
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
  
  // Generate months (Arabic names)
  const months = moment.months();
  
  // Generate days based on selected year and month
  const getDaysInMonth = (year: number, month: number) => {
    const daysInMonth = moment(`${year}-${month + 1}`, 'YYYY-MM').daysInMonth();
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  };
  const days = getDaysInMonth(selectedYear, selectedMonth);

  const fetchAvailabilities = async () => {
    try {
      const response = await fetch('/api/mentor/availability', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const formattedEvents = data.map((avail: any) => ({
          id: avail.id,
          start: new Date(avail.startTime),
          end: new Date(avail.endTime),
          title: 'متاح',
        }));
        setEvents(formattedEvents);
      } else if (response.status === 401) {
        toast({
          title: "غير مصرح",
          description: "يجب تسجيل الدخول لعرض هذه الصفحة. جاري التحويل...",
          variant: "destructive",
        });
        router.push('/login');
      } else {
        toast({
          title: "خطأ",
          description: "فشل في جلب أوقات التوافر.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء جلب أوقات التوافر.",
        variant: "destructive",
      })
    }
  };

  useEffect(() => {
    fetchAvailabilities();
  }, []);
  
  // Update days when year or month changes
  useEffect(() => {
    const newDays = getDaysInMonth(selectedYear, selectedMonth);
    // If the selected day is not valid in the new month, adjust it
    if (selectedDay > newDays.length) {
      setSelectedDay(newDays.length);
    }
  }, [selectedYear, selectedMonth]);
  
  // Handle date selection
  const handleDateChange = () => {
    const newDate = moment().year(selectedYear).month(selectedMonth).date(selectedDay);
    setSelectedDate(newDate);
    
    // Update calendar view to the selected date
    if (calendarRef.current && calendarRef.current.getApi) {
      calendarRef.current.getApi().gotoDate(newDate.toDate());
    } else {
      // For react-big-calendar, we'll update the date prop
      // This will be handled by the date prop in the Calendar component
    }
  };

  const handleSelectSlot = async ({ start, end }: { start: Date; end: Date }) => {
    try {
      const response = await fetch('/api/mentor/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startTime: start, endTime: end }),
        credentials: 'include',
      });

      if (response.ok) {
        fetchAvailabilities();
        toast({
          title: "تم بنجاح",
          description: "تمت إضافة وقت التوافر بنجاح.",
        })
      } else {
        toast({
          title: "خطأ",
          description: "فشل في إضافة وقت التوافر.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إضافة وقت التوافر.",
        variant: "destructive",
      })
    }
  };

  const handleSelectEvent = async (event: Availability) => {
    if (window.confirm('هل أنت متأكد أنك تريد حذف وقت التوافر هذا؟')) {
      try {
        const response = await fetch(`/api/mentor/availability/${event.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        if (response.ok) {
          fetchAvailabilities();
          toast({
            title: "تم بنجاح",
            description: "تم حذف وقت التوافر بنجاح.",
          })
        } else {
          toast({
            title: "خطأ",
            description: "فشل في حذف وقت التوافر.",
            variant: "destructive",
          })
        }
      } catch (error) {
        toast({
          title: "خطأ",
          description: "حدث خطأ أثناء حذف وقت التوافر.",
          variant: "destructive",
        })
      }
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">إدارة أوقات التوافر الخاصة بك</h1>
      <p className="mb-4">انقر واسحب على التقويم لإنشاء فترات توافر جديدة. انقر على فترة موجودة لحذفها.</p>
      
      {/* Date Selection UI */}
      <div className="mb-4 flex flex-wrap gap-2 items-center bg-white p-4 rounded-lg">
        <div className="flex items-center">
          <label htmlFor="year-select" className="ml-2 font-medium">السنة:</label>
          <select
            id="year-select"
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(parseInt(e.target.value));
              setTimeout(handleDateChange, 0);
            }}
            className="p-2 border rounded-md bg-white text-right"
            dir="rtl"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center">
          <label htmlFor="month-select" className="ml-2 font-medium">الشهر:</label>
          <select
            id="month-select"
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(parseInt(e.target.value));
              setTimeout(handleDateChange, 0);
            }}
            className="p-2 border rounded-md bg-white text-right"
            dir="rtl"
          >
            {months.map((month, index) => (
              <option key={index} value={index}>
                {month}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center">
          <label htmlFor="day-select" className="ml-2 font-medium">اليوم:</label>
          <select
            id="day-select"
            value={selectedDay}
            onChange={(e) => {
              setSelectedDay(parseInt(e.target.value));
              setTimeout(handleDateChange, 0);
            }}
            className="p-2 border rounded-md bg-white text-right"
            dir="rtl"
          >
            {days.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </div>
        
        <Button 
          onClick={handleDateChange}
          className="mr-auto"
        >
          انتقال للتاريخ
        </Button>
      </div>
      
      <div style={{ height: '70vh', backgroundColor: 'white', padding: '20px', borderRadius: '8px' }}>
        <Calendar
          localizer={localizer}
          step={SLOT_STEP_MINUTES}
          timeslots={SLOT_TIMESLOTS_PER_HOUR}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          defaultView="week"
          views={['day', 'week', 'agenda']}
          date={selectedDate.toDate()}
          onNavigate={(date) => {
            const newDate = moment(date);
            setSelectedYear(newDate.year());
            setSelectedMonth(newDate.month());
            setSelectedDay(newDate.date());
            setSelectedDate(newDate);
          }}
          ref={calendarRef}
        />
      </div>
    </div>
  );
};

export default AvailabilityPage;
