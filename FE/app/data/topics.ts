export type TopicIconName =
  | "array"
  | "string"
  | "linked-list"
  | "stack-queue"
  | "tree-graph"
  | "dp"
  | "sorting-searching"
  | "hashing";

export type TopicAccent =
  | "emerald"
  | "sky"
  | "violet"
  | "amber"
  | "rose"
  | "orange";

export type Topic = {
  slug: string;
  title: string;
  description: string;
  icon: TopicIconName;
  accent: TopicAccent;
  count: number;
  level: "Sơ cấp" | "Trung bình" | "Nâng cao";
};

export const topics: Topic[] = [
  {
    slug: "array",
    title: "Mảng & Con trỏ",
    description:
      "Duyệt mảng, two pointers, sliding window, prefix sum và mảng hiệu.",
    icon: "array",
    accent: "emerald",
    count: 18,
    level: "Sơ cấp",
  },
  {
    slug: "string",
    title: "Chuỗi",
    description:
      "Xử lý chuỗi, pattern matching, palindrome, anagram và regex cơ bản.",
    icon: "string",
    accent: "sky",
    count: 5,
    level: "Sơ cấp",
  },
  {
    slug: "linked-list",
    title: "Danh sách liên kết",
    description:
      "Đảo list, phát hiện chu trình, merge hai list đã sắp xếp.",
    icon: "linked-list",
    accent: "violet",
    count: 2,
    level: "Trung bình",
  },
  {
    slug: "stack-queue",
    title: "Stack & Hàng đợi",
    description:
      "Ngoặc hợp lệ, monotonic stack, min-stack và BFS bằng queue.",
    icon: "stack-queue",
    accent: "amber",
    count: 5,
    level: "Trung bình",
  },
  {
    slug: "tree-graph",
    title: "Cây & Đồ thị",
    description:
      "DFS/BFS, cây nhị phân, đường ngắn nhất và hợp nhất tập rời rạc.",
    icon: "tree-graph",
    accent: "rose",
    count: 2,
    level: "Trung bình",
  },
  {
    slug: "dp",
    title: "Quy hoạch động",
    description:
      "Knapsack, dãy con tăng dài nhất, DP trên chuỗi và trên lưới.",
    icon: "dp",
    accent: "orange",
    count: 6,
    level: "Nâng cao",
  },
  {
    slug: "sorting-searching",
    title: "Sắp xếp & Tìm kiếm",
    description:
      "Binary search, quick/merge sort và các biến thể tìm kiếm nâng cao.",
    icon: "sorting-searching",
    accent: "sky",
    count: 6,
    level: "Trung bình",
  },
  {
    slug: "hashing",
    title: "Hàm băm & Tập hợp",
    description:
      "Two-sum, frequency map, sliding window với hash và set nâng cao.",
    icon: "hashing",
    accent: "emerald",
    count: 10,
    level: "Sơ cấp",
  },
];
