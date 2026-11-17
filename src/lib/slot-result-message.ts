import { formatTime } from '@/components/attendance/time-format';

/** What POST …/availability answers (see createSlotsForMentor in src/lib/slots.ts). */
export interface AddSlotsAnswer {
  created?: number;
  skipped?: number;
  skippedOwn?: number;
  skippedOrganization?: number;
  alignedToOrganization?: boolean;
  slots?: Array<{ startTime: string }>;
}

/**
 * Toast text after adding availability (mentor page and admin page): what was
 * added (Riyadh times), whether it was put on the organization's times, and
 * — when nothing was added — the actual reason.
 */
export function slotResultMessage(data: AddSlotsAnswer, viewer: 'mentor' | 'admin'): { title: string; description: string; nothingAdded: boolean } {
  const created = Number(data.created ?? 0);
  const own = Number(data.skippedOwn ?? 0);
  const org = Number(data.skippedOrganization ?? 0);
  const colleagues = viewer === 'mentor' ? 'زملائك في الجهة' : 'زملاء الموجه في الجهة';
  const ownSlots = viewer === 'mentor' ? 'فتراتك' : 'فترات الموجه';

  if (created === 0) {
    return {
      title: 'لم تُضف أي فترة',
      nothingAdded: true,
      description:
        org > 0
          ? `الأوقات تتعارض مع فترات ${colleagues}: يجب أن تطابق مواعيدهم تماماً أو تبعد عنها 5 دقائق على الأقل. اختر وقتاً آخر، أو احذف فترات الجهة في هذا الوقت أولاً.`
          : `هذه الأوقات مضافة مسبقاً أو قريبة جداً من ${ownSlots} (يجب ترك 5 دقائق بين الفترات).`,
    };
  }
  const times = (data.slots ?? []).map((s) => formatTime(s.startTime)).join('، ');
  const parts = [`تمت إضافة ${created} فترة${times ? ` (${times})` : ''}`];
  if (data.alignedToOrganization) parts.push('بمواعيد الجهة نفسها حتى تظهر للمشاركين فترةً واحدة للجهة');
  if (own) parts.push(`تم تجاوز ${own} لتداخلها مع ${ownSlots}`);
  if (org) parts.push(`وتم تجاوز ${org} لتعارضها مع فترات ${colleagues}`);
  return { title: 'تمت الإضافة', nothingAdded: false, description: `${parts.join(' — ')}.` };
}
