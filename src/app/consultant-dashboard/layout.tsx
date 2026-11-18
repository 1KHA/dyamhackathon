import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تقييم المستشارين | مياهثون",
  description: "لوحة تقييم فرق المرحلة النهائية وفق معايير التقييم",
  robots: { index: false, follow: false },
};

export default function ConsultantDashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
