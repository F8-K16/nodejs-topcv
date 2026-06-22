import { ExperienceLevel, JobModerationStatus, JobType } from "../generated/prisma/enums";

export const JOB_MODERATION_OPTIONS = [
  { value: JobModerationStatus.PENDING, label: "Chờ duyệt" },
  { value: JobModerationStatus.APPROVED, label: "Đã duyệt" },
  { value: JobModerationStatus.REJECTED, label: "Từ chối" },
] as const;

export const JOB_TYPE_OPTIONS = [
  { value: "FULL_TIME", label: "Toàn thời gian" },
  { value: "PART_TIME", label: "Bán thời gian" },
  { value: "FREELANCE", label: "Freelance" },
];

export const EXPERIENCE_OPTIONS = [
  { value: "INTERN", label: "Thực tập" },
  { value: "FRESHER", label: "Không yêu cầu" },
  { value: "JUNIOR", label: "1-2 năm" },
  { value: "MIDDLE", label: "3-5 năm" },
  { value: "SENIOR", label: "5-10 năm" },
  { value: "LEAD", label: "Trưởng nhóm" },
];

export const SalaryRange = {
  UNDER_10: "under_10",
  FROM_10_15: "10_15",
  FROM_15_20: "15_20",
  FROM_20_25: "20_25",
  FROM_25_30: "25_30",
  FROM_30_50: "30_50",
  OVER_50: "over_50",
  NEGOTIABLE: "negotiable",
} as const;

export type SalaryRangeType = (typeof SalaryRange)[keyof typeof SalaryRange];

export const SalaryRangeOptions = [
  { value: SalaryRange.UNDER_10, label: "Dưới 10 triệu" },
  { value: SalaryRange.FROM_10_15, label: "10 - 15 triệu" },
  { value: SalaryRange.FROM_15_20, label: "15 - 20 triệu" },
  { value: SalaryRange.FROM_20_25, label: "20 - 25 triệu" },
  { value: SalaryRange.FROM_25_30, label: "25 - 30 triệu" },
  { value: SalaryRange.FROM_30_50, label: "30 - 50 triệu" },
  { value: SalaryRange.OVER_50, label: "Trên 50 triệu" },
  { value: SalaryRange.NEGOTIABLE, label: "Thỏa thuận" },
];

export type JobDTO = {
  id?: number;
  title: string;
  description: string;
  minSalary?: number;
  maxSalary?: number;

  quantity: number;
  jobType: JobType;
  experienceLevel: ExperienceLevel;

  employerId?: number;
  companyId: number;
  categoryId: number;

  moderationStatus?: JobModerationStatus;
  deadline?: Date | string | null;
  isFeatured?: boolean;
  workLocation?: string | null;
  skillIds?: number[];
};
