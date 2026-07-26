import { prisma } from './prisma';

export interface CreateNotificationParams {
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
  recipientType: 'admin' | 'participant' | 'mentor';
  recipientId: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  actionUrl?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  recipientType: string;
  recipientId: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  actionUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new notification
 */
export async function createNotification(params: CreateNotificationParams): Promise<Notification> {
  return await prisma.notification.create({
    data: {
      title: params.title,
      message: params.message,
      type: params.type,
      recipientType: params.recipientType,
      recipientId: params.recipientId,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
      actionUrl: params.actionUrl,
    },
  });
}

/**
 * Get notifications for a specific user
 */
export async function getNotifications(
  recipientType: string,
  recipientId: string,
  options: {
    page?: number;
    limit?: number;
    isRead?: boolean;
    type?: string;
  } = {}
): Promise<{ notifications: Notification[]; total: number }> {
  const { page = 1, limit = 20, isRead, type } = options;
  const skip = (page - 1) * limit;

  const where = {
    recipientType,
    recipientId,
    ...(isRead !== undefined && { isRead }),
    ...(type && { type }),
  };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return { notifications, total };
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadNotificationCount(
  recipientType: string,
  recipientId: string
): Promise<number> {
  return await prisma.notification.count({
    where: {
      recipientType,
      recipientId,
      isRead: false,
    },
  });
}

/**
 * Mark a notification as read.
 *
 * Scoped to the owning recipient so one user cannot mark another user's
 * notification as read. `updateMany` is deliberate: a non-matching id updates
 * zero rows instead of throwing, so a foreign id is a silent no-op.
 */
export async function markNotificationAsRead(
  notificationId: string,
  recipientType: string,
  recipientId: string
): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      recipientType,
      recipientId,
    },
    data: { isRead: true },
  });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(
  recipientType: string,
  recipientId: string
): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      recipientType,
      recipientId,
      isRead: false,
    },
    data: { isRead: true },
  });
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string): Promise<void> {
  await prisma.notification.delete({
    where: { id: notificationId },
  });
}

// Notification Templates
export const NotificationTemplates = {
  // Admin notifications
  newTeamRegistration: (teamName: string) => ({
    title: "طلب تسجيل فريق جديد",
    message: `تم تسجيل فريق جديد: ${teamName} ويحتاج للمراجعة`,
    type: "info" as const,
    actionUrl: "/admin-hackton-dashboard/teams",
  }),

  newMilestoneSubmission: (teamName: string, milestoneTitle: string) => ({
    title: "تسليم مشروع جديد",
    message: `تم تسليم مشروع من فريق ${teamName} للمرحلة ${milestoneTitle}`,
    type: "info" as const,
    actionUrl: "/admin-hackton-dashboard/submissions",
  }),

  eventCapacityWarning: (eventTitle: string) => ({
    title: "تحذير سعة الفعالية",
    message: `الفعالية ${eventTitle} وصلت إلى 80% من السعة`,
    type: "warning" as const,
    actionUrl: "/admin-hackton-dashboard/events",
  }),

  newEventRegistration: (participantName: string, eventTitle: string) => ({
    title: "تسجيل جديد في الفعالية",
    message: `تم تسجيل ${participantName} في فعالية ${eventTitle}`,
    type: "info" as const,
  }),

  // Note: there is no mentor self-application flow in the platform — mentors
  // are created by an admin — so this describes an addition, not a request.
  newMentorRegistration: (mentorName: string) => ({
    title: "مرشد جديد تمت إضافته",
    message: `تم إضافة مرشد جديد: ${mentorName} بواسطة المشرف`,
    type: "info" as const,
    actionUrl: "/admin-hackton-dashboard/mentors",
  }),

  // Participant notifications
  teamApproval: (teamName: string) => ({
    title: "تم قبول فريقك!",
    message: `تهانينا! تم قبول فريق ${teamName} في الهاكثون`,
    type: "success" as const,
    actionUrl: "/participant-dashboard",
  }),

  teamRejection: (teamName: string) => ({
    title: "لم يتم قبول فريقك",
    message: `نأسف، لم يتم قبول فريق ${teamName}. يرجى مراجعة المتطلبات`,
    type: "error" as const,
  }),

  eventRegistrationConfirmation: (eventTitle: string) => ({
    title: "تأكيد التسجيل في الفعالية",
    message: `تم تسجيلك بنجاح في فعالية ${eventTitle}`,
    type: "success" as const,
    actionUrl: "/participant-dashboard/events",
  }),

  eventReminder24h: (eventTitle: string, time: string) => ({
    title: "تذكير: فعالية غداً",
    message: `فعالية ${eventTitle} ستبدأ غداً في ${time}`,
    type: "info" as const,
  }),

  eventReminder1h: (eventTitle: string, location: string) => ({
    title: "تذكير: فعالية خلال ساعة",
    message: `فعالية ${eventTitle} ستبدأ خلال ساعة في ${location}`,
    type: "warning" as const,
  }),

  newMilestoneAvailable: (milestoneTitle: string) => ({
    title: "مرحلة جديدة متاحة",
    message: `مرحلة جديدة ${milestoneTitle} متاحة للتسليم`,
    type: "info" as const,
    actionUrl: "/participant-dashboard/milestones",
  }),

  milestoneDeadlineReminder: (milestoneTitle: string, timeLeft: string) => ({
    title: "تذكير: موعد تسليم المرحلة",
    message: `موعد تسليم ${milestoneTitle} خلال ${timeLeft}`,
    type: "warning" as const,
  }),

  milestoneReviewResult: (milestoneTitle: string, result: 'accepted' | 'rejected') => ({
    title: "نتيجة مراجعة المشروع",
    message: `تم ${result === 'accepted' ? 'قبول' : 'رفض'} مشروعك للمرحلة ${milestoneTitle}`,
    type: result === 'accepted' ? "success" as const : "error" as const,
    actionUrl: "/participant-dashboard/milestones",
  }),

  // Mentor notifications
  newBookingRequest: (participantName: string, dateTime: string) => ({
    title: "طلب حجز جلسة جديد",
    message: `طلب ${participantName} حجز جلسة معك في ${dateTime}`,
    type: "info" as const,
    actionUrl: "/mentor-dashboard/sessions",
  }),

  bookingCancellation: (participantName: string, dateTime: string) => ({
    title: "إلغاء حجز جلسة",
    message: `تم إلغاء الجلسة مع ${participantName} المقررة في ${dateTime}`,
    type: "warning" as const,
  }),

  mentorProfileApproval: () => ({
    title: "تم قبول طلبك كمرشد",
    message: "تهانينا! تم قبولك كمرشد في منصة الهاكثون",
    type: "success" as const,
    actionUrl: "/mentor-dashboard",
  }),

  // Team join request notifications
  teamJoinRequest: (participantName: string, teamName: string) => ({
    title: "طلب انضمام جديد للفريق",
    message: `${participantName} يريد الانضمام لفريق ${teamName}`,
    type: "info" as const,
    actionUrl: "/participant-dashboard/join-requests",
  }),

  joinRequestAccepted: (teamName: string) => ({
    title: "تم قبول طلب الانضمام!",
    message: `تهانينا! تم قبولك في فريق ${teamName}`,
    type: "success" as const,
    actionUrl: "/participant-dashboard/team",
  }),

  joinRequestRejected: (teamName: string) => ({
    title: "لم يتم قبول طلب الانضمام",
    message: `لم يتم قبولك في فريق ${teamName}`,
    type: "info" as const,
  }),

  joinRequestCancelled: (teamName: string) => ({
    title: "تم إلغاء طلب الانضمام",
    message: `تم إلغاء طلب انضمامك لفريق ${teamName} بسبب انضمامك لفريق آخر`,
    type: "info" as const,
  }),
};

/**
 * Helper function to create notifications for all admins
 */
export async function notifyAllAdmins(
  title: string,
  message: string,
  type: 'success' | 'info' | 'warning' | 'error',
  options: {
    relatedEntityType?: string;
    relatedEntityId?: string;
    actionUrl?: string;
  } = {}
): Promise<void> {
  try {
    // Fetch all admin IDs from the database
    const admins = await prisma.admin.findMany({
      select: { id: true },
    });

    // If no admins exist, create notifications for a default admin ID
    const adminIds = admins.length > 0 ? admins.map(admin => admin.id) : ["admin-1"];
    
    // Create notifications for all admins
    const notifications = adminIds.map(adminId => ({
      title,
      message,
      type,
      recipientType: "admin" as const,
      recipientId: adminId,
      ...options,
    }));

    await prisma.notification.createMany({
      data: notifications,
    });
  } catch (error) {
    console.error('Error creating admin notifications:', error);
    // Fallback: create notification for default admin
    await createNotification({
      title,
      message,
      type,
      recipientType: "admin",
      recipientId: "admin-1",
      ...options,
    });
  }
}

/**
 * Helper function to create notifications for team members
 */
export async function notifyTeamMembers(
  teamId: string,
  title: string,
  message: string,
  type: 'success' | 'info' | 'warning' | 'error',
  options: {
    relatedEntityType?: string;
    relatedEntityId?: string;
    actionUrl?: string;
  } = {}
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { participants: true },
  });

  if (!team) return;

  const notifications = team.participants.map(participant => ({
    title,
    message,
    type,
    recipientType: "participant" as const,
    recipientId: participant.id,
    ...options,
  }));

  await prisma.notification.createMany({
    data: notifications,
  });
}
