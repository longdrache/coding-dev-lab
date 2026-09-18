export type Contest = {
  slug: string;
  title: string;
  edition: string;
  status: "upcoming" | "past";
  scheduleLabel: string;
  durationLabel: string;
  problemCount: number;
  participants?: number;
  description: string;
};

export const CONTEST_CADENCE_LABEL = "Chủ nhật hàng tuần • 20:00";

export const upcomingContest: Contest = {
  slug: "gocode-weekly-next",
  title: "GoCode Weekly",
  edition: "Kỳ tới",
  status: "upcoming",
  scheduleLabel: CONTEST_CADENCE_LABEL,
  durationLabel: "90 phút • 4 bài",
  problemCount: 4,
  description:
    "Cuộc thi luyện tập định kỳ mỗi tối Chủ nhật: 4 bài thuật toán từ Dễ đến Trung bình trong 90 phút. Kết quả tính theo số bài đúng và tổng thời gian nộp.",
};

export const pastContests: Contest[] = [
  {
    slug: "gocode-weekly-11",
    title: "GoCode Weekly #11",
    edition: "#11",
    status: "past",
    scheduleLabel: "Đã diễn ra",
    durationLabel: "90 phút • 4 bài",
    problemCount: 4,
    participants: 128,
    description:
      "Chủ đề mảng và chuỗi: Two Sum biến thể, sliding window và xử lý chuỗi.",
  },
  {
    slug: "gocode-weekly-10",
    title: "GoCode Weekly #10",
    edition: "#10",
    status: "past",
    scheduleLabel: "Đã diễn ra",
    durationLabel: "90 phút • 4 bài",
    problemCount: 4,
    participants: 96,
    description:
      "Chủ đề tìm kiếm và sắp xếp: binary search nâng cao và sắp xếp tùy chỉnh.",
  },
  {
    slug: "gocode-newbie-03",
    title: "GoCode Newbie #3",
    edition: "Newbie #3",
    status: "past",
    scheduleLabel: "Đã diễn ra",
    durationLabel: "60 phút • 3 bài",
    problemCount: 3,
    participants: 214,
    description:
      "Sân chơi cho người mới: 3 bài mức Dễ, gợi ý từng bước trong lúc thi.",
  },
];

/** Tính thời điểm kỳ thi tới: 20:00 Chủ nhật hàng tuần (giờ địa phương). */
export function getNextContestDate(from: Date = new Date()): Date {
  const target = new Date(from);
  target.setHours(20, 0, 0, 0);
  let diff = (7 - target.getDay()) % 7;
  if (diff === 0 && target.getTime() <= from.getTime()) {
    diff = 7;
  }
  target.setDate(target.getDate() + diff);
  return target;
}
