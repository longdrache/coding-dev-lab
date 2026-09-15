type ComprehensiveFaq = {
  id: string;
  category: "sandbox" | "tracks" | "account" | "interview";
  question: string;
  answer: string;
  tags: string[];
};

export const EXTENDED_FAQS: ComprehensiveFaq[] = [
  {
    id: "f1",
    category: "sandbox",
    question: "Mã nguồn của tôi được biên dịch và chạy ở đâu?",
    answer:
      "Tất cả mã nguồn được thực thi bên trong môi trường Linux Container Sandbox riêng biệt được phân bổ tài nguyên nghiêm ngặt (cgroup). Không qua các dịch vụ trung gian chậm trễ, thời gian phản hồi thực tế đạt dưới 25-50ms đối với cả các ngôn ngữ biên dịch như C/C++ và thông dịch như Python/JavaScript.",
    tags: ["sandbox", "security", "cgroups", "docker"],
  },
  {
    id: "f2",
    category: "sandbox",
    question: "Những ngôn ngữ nào được hỗ trợ theo chuẩn Judge0 Native?",
    answer:
      "Hiện tại hệ thống hỗ trợ trọn vẹn 9 môi trường thịnh hành nhất: C++ (G++ 12 - ID #54), C (GCC 12 - ID #50), Python 3.10 (ID #71), TypeScript 5.8 (ID #74), JavaScript Node 22 (ID #63), Go 1.19 (ID #95), PHP 8.2 (ID #68), Bash Shell 5.2 (ID #46) và SQL SQLite3 (ID #82). Tất cả đều tương thích chuẩn đầu vào và đầu ra của Judge0.",
    tags: ["judge0", "cpp", "python", "typescript", "go", "php", "sql"],
  },
  {
    id: "f3",
    category: "sandbox",
    question:
      "Giới hạn thời gian (Time Limit) và bộ nhớ (Memory Limit) là bao nhiêu?",
    answer:
      "Mỗi tiến trình thực thi được cấp tối đa 5,000ms (5 giây) thời gian CPU và 256MB RAM. Nếu thuật toán rơi vào vòng lặp vô tận (Infinite Loop), hệ thống sẽ chủ động ngắt tiến trình bằng tín hiệu SIGKILL và trả về trạng thái Time Limit Exceeded (TLE) nhằm bảo vệ hạ tầng.",
    tags: ["limits", "tle", "oom", "sigkill"],
  },
  {
    id: "f4",
    category: "tracks",
    question:
      "Lộ trình học tại DevForge khác gì so với tự luyện trên LeetCode?",
    answer:
      'LeetCode tập trung vào số lượng bài tập rời rạc khiến người học dễ sa đà vào việc học vẹt lời giải. DevForge tổ chức theo mô hình "Cấu trúc -> Kỹ thuật -> Tối ưu -> Ứng dụng thực tế". Mỗi chuyên đề đều đi kèm cơ chế phân tích trực quan về độ phức tạp thời gian Big-O, giúp bạn hiểu cặn kẽ tại sao thuật toán lại chạy nhanh hoặc tốn bộ nhớ.',
    tags: ["dsa", "leetcode", "curriculum"],
  },
  {
    id: "f5",
    category: "tracks",
    question: "Tôi là người mới bắt đầu (Beginner), nên bắt đầu từ đâu?",
    answer:
      'Hãy bắt đầu với lộ trình "Cấu trúc dữ liệu & Giải thuật Cốt lõi" (DSA) với cấp độ Dễ. Hãy giải từ bài Two Sum (Hai số có tổng bằng mục tiêu) bằng ngôn ngữ bạn quen thuộc nhất (Python hoặc TypeScript). Sau đó chuyển dần sang kỹ thuật Hai con trỏ và Bảng băm.',
    tags: ["beginner", "roadmap", "start"],
  },
  {
    id: "f6",
    category: "interview",
    question:
      "Các bài tập này có sát với phỏng vấn tại các Big Tech và Unicorn?",
    answer:
      "Kho bài tập của DevForge được chọn lọc kỹ lưỡng từ ngân hàng đề thi thực tế của các công ty công nghệ hàng đầu như Grab, Shopee, VNG, Google, Meta và Amazon. Chúng tôi tập trung vào 75 bài cốt lõi (Blind 75 & NeetCode 150) xuất hiện với tần suất trên 80% trong các vòng technical interview.",
    tags: ["bigtech", "interview", "faang", "grab"],
  },
  {
    id: "f7",
    category: "interview",
    question: "Lộ trình System Design có bao gồm bài toán thực tế không?",
    answer:
      "Có. Lộ trình System Design phân tích kiến trúc từ sơ cấp đến nâng cao thông qua 4 ca điển hình: Thiết kế dịch vụ rút gọn URL (TinyURL) chịu tải 100M QPS, Hệ thống Chat Real-time WebSocket, Kiến trúc Streaming Video tương tự Netflix, và Chiến lược Sharding/Replication cho cơ sở dữ liệu lớn.",
    tags: ["system-design", "kafka", "redis", "scaling"],
  },
  {
    id: "f8",
    category: "account",
    question:
      "Tôi có cần trả phí để sử dụng Trình soạn thảo và chạy code không?",
    answer:
      "Toàn bộ tính năng cốt lõi bao gồm Trình soạn thảo trực tuyến 9 ngôn ngữ, hệ thống kiểm thử tự động, kho bài tập cơ bản và các chuyên đề nền tảng đều hoàn toàn miễn phí không giới hạn lượt chạy.",
    tags: ["pricing", "free", "account"],
  },
  {
    id: "f9",
    category: "account",
    question: "Tiến độ làm bài và lịch sử giải code có được lưu lại không?",
    answer:
      "Khi bạn đăng nhập tài khoản, toàn bộ lời giải mã nguồn, trạng thái hoàn thành bài tập, thời gian chạy và chuỗi ngày luyện tập (streak) sẽ được tự động lưu trữ trên đám mây để bạn có thể tiếp tục học tập từ bất kỳ thiết bị nào.",
    tags: ["cloud", "sync", "progress", "streak"],
  },
];
