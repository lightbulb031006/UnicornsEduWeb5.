import type { SeedPack } from './types';

const MODULES = {
  derivative: 'Hàm số và đạo hàm',
  logarithm: 'Mũ và logarit',
  probability: 'Tổ hợp – Xác suất',
  integral: 'Nguyên hàm – Tích phân',
  oxyz: 'Hình học không gian Oxyz',
  review: 'Ôn tập & Đề tổng hợp',
} as const;

const NB = 'Nhận biết';
const TH = 'Thông hiểu';
const VD = 'Vận dụng';
const VDC = 'Vận dụng cao';

/**
 * Pack Toán THPT, dùng cho các khoá THPT Basic / THPT Advanced / THPT Luyện Đề.
 * 30 câu (25 trắc nghiệm + 5 tự luận) trải 5 chuyên đề.
 */
export const mathThptPack: SeedPack = {
  key: 'math-thpt',
  courseNames: ['THPT Basic', 'THPT Advanced', 'THPT Luyện Đề'],
  difficultyLevels: [NB, TH, VD, VDC],
  modules: [
    MODULES.derivative,
    MODULES.logarithm,
    MODULES.probability,
    MODULES.integral,
    MODULES.oxyz,
    MODULES.review,
  ],
  questions: [
    // ── Hàm số và đạo hàm ─────────────────────────────────────────────────
    {
      key: 'dv-01',
      module: MODULES.derivative,
      difficulty: NB,
      type: 'single_choice',
      content: '<p>Đạo hàm của hàm số $y = x^5$ là:</p>',
      options: ['$5x^4$', '$x^4$', '$\\frac{x^6}{6}$', '$5x^6$'],
      correctIndex: 0,
      explanation: '<p>Áp dụng $(x^n)\' = n x^{n-1}$ với $n = 5$.</p>',
    },
    {
      key: 'dv-02',
      module: MODULES.derivative,
      difficulty: NB,
      type: 'single_choice',
      content:
        '<p>Hàm số $y = f(x)$ đồng biến trên khoảng $K$ khi nào?</p>',
      options: [
        '$f\'(x) \\ge 0$ với mọi $x \\in K$ và $f\'(x) = 0$ tại hữu hạn điểm',
        '$f\'(x) \\le 0$ với mọi $x \\in K$',
        '$f(x) &gt; 0$ với mọi $x \\in K$',
        '$f\'\'(x) &gt; 0$ với mọi $x \\in K$',
      ],
      correctIndex: 0,
      explanation:
        '<p>Dấu của đạo hàm bậc nhất quyết định chiều biến thiên; đạo hàm bậc hai chỉ nói về tính lồi lõm.</p>',
    },
    {
      key: 'dv-03',
      module: MODULES.derivative,
      difficulty: TH,
      type: 'single_choice',
      content: '<p>Đạo hàm của hàm số $y = \\ln(2x + 1)$ là:</p>',
      options: [
        '$\\frac{1}{2x+1}$',
        '$\\frac{2}{2x+1}$',
        '$\\frac{2x}{2x+1}$',
        '$\\frac{\\ln 2}{2x+1}$',
      ],
      correctIndex: 1,
      explanation:
        '<p>Áp dụng đạo hàm hàm hợp $(\\ln u)\' = \\dfrac{u\'}{u}$ với $u = 2x + 1$, $u\' = 2$.</p>',
    },
    {
      key: 'dv-04',
      module: MODULES.derivative,
      difficulty: TH,
      type: 'single_choice',
      content: '<p>Hàm số $y = x^3 - 3x$ đạt cực đại tại điểm nào?</p>',
      options: ['$x = -1$', '$x = 0$', '$x = 1$', '$x = 3$'],
      correctIndex: 0,
      explanation:
        '<p>$y\' = 3x^2 - 3 = 0 \\Leftrightarrow x = \\pm 1$. Bảng biến thiên cho $y\'$ đổi dấu từ $+$ sang $-$ tại $x = -1$ nên đó là điểm cực đại.</p>',
    },
    {
      key: 'dv-05',
      module: MODULES.derivative,
      difficulty: VD,
      type: 'single_choice',
      content:
        '<p>Giá trị lớn nhất của hàm số $y = x^3 - 3x + 2$ trên đoạn $[0; 2]$ là:</p>',
      options: ['$0$', '$2$', '$4$', '$6$'],
      correctIndex: 2,
      explanation:
        '<p>$y\' = 3x^2 - 3 = 0 \\Rightarrow x = 1 \\in [0;2]$. So sánh $y(0) = 2$, $y(1) = 0$, $y(2) = 4$ nên giá trị lớn nhất là $4$.</p>',
    },
    {
      key: 'dv-06',
      module: MODULES.derivative,
      difficulty: VDC,
      type: 'essay',
      content:
        '<p>Chứng minh rằng phương trình $x^5 + x - 1 = 0$ có <strong>đúng một</strong> nghiệm thực.</p>',
      answerGuide:
        '<p>Ý cần có:</p><ul><li>Đặt $f(x) = x^5 + x - 1$, tính $f\'(x) = 5x^4 + 1 &gt; 0$ với mọi $x$.</li><li>Suy ra $f$ đồng biến trên $\\mathbb{R}$ nên có <strong>tối đa</strong> một nghiệm.</li><li>Tính $f(0) = -1 &lt; 0$, $f(1) = 1 &gt; 0$; $f$ liên tục nên theo định lý giá trị trung gian tồn tại nghiệm trong $(0; 1)$.</li><li>Kết luận: tồn tại và duy nhất.</li></ul>',
    },

    // ── Mũ và logarit ─────────────────────────────────────────────────────
    {
      key: 'lg-01',
      module: MODULES.logarithm,
      difficulty: NB,
      type: 'single_choice',
      content:
        '<p>Với $a &gt; 0$, $a \\ne 1$ và $x, y &gt; 0$, đẳng thức nào đúng?</p>',
      options: [
        '$\\log_a(xy) = \\log_a x + \\log_a y$',
        '$\\log_a(xy) = \\log_a x \\cdot \\log_a y$',
        '$\\log_a(x + y) = \\log_a x + \\log_a y$',
        '$\\log_a\\left(\\frac{x}{y}\\right) = \\frac{\\log_a x}{\\log_a y}$',
      ],
      correctIndex: 0,
      explanation:
        '<p>Logarit biến tích thành tổng. Ba đáp án còn lại là các nhầm lẫn phổ biến.</p>',
    },
    {
      key: 'lg-02',
      module: MODULES.logarithm,
      difficulty: NB,
      type: 'single_choice',
      content: '<p>Tập xác định của hàm số $y = \\log_2(x - 1)$ là:</p>',
      options: ['$(1; +\\infty)$', '$[1; +\\infty)$', '$(0; +\\infty)$', '$\\mathbb{R}$'],
      correctIndex: 0,
      explanation: '<p>Điều kiện $x - 1 &gt; 0 \\Leftrightarrow x &gt; 1$.</p>',
    },
    {
      key: 'lg-03',
      module: MODULES.logarithm,
      difficulty: TH,
      type: 'single_choice',
      content: '<p>Nghiệm của phương trình $2^{x+1} = 8$ là:</p>',
      options: ['$x = 1$', '$x = 2$', '$x = 3$', '$x = 4$'],
      correctIndex: 1,
      explanation:
        '<p>$8 = 2^3$ nên $x + 1 = 3 \\Leftrightarrow x = 2$.</p>',
    },
    {
      key: 'lg-04',
      module: MODULES.logarithm,
      difficulty: TH,
      type: 'single_choice',
      content: '<p>Nghiệm của phương trình $\\log_2 x + \\log_2(x - 2) = 3$ là:</p>',
      options: ['$x = 2$', '$x = 4$', '$x = 8$', '$x = -2$ và $x = 4$'],
      correctIndex: 1,
      explanation:
        '<p>Điều kiện $x &gt; 2$. Phương trình thành $\\log_2\\big(x(x-2)\\big) = 3 \\Leftrightarrow x^2 - 2x - 8 = 0 \\Leftrightarrow x = 4$ hoặc $x = -2$; loại $x = -2$ vì không thoả điều kiện.</p>',
    },
    {
      key: 'lg-05',
      module: MODULES.logarithm,
      difficulty: VD,
      type: 'single_choice',
      content: '<p>Tập nghiệm của bất phương trình $3^{x^2 - 2x} &lt; 27$ là:</p>',
      options: ['$(-1; 3)$', '$(-3; 1)$', '$(-\\infty; -1) \\cup (3; +\\infty)$', '$(0; 2)$'],
      correctIndex: 0,
      explanation:
        '<p>Cơ số $3 &gt; 1$ nên bất phương trình tương đương $x^2 - 2x &lt; 3 \\Leftrightarrow x^2 - 2x - 3 &lt; 0 \\Leftrightarrow -1 &lt; x &lt; 3$.</p>',
    },
    {
      key: 'lg-06',
      module: MODULES.logarithm,
      difficulty: VDC,
      type: 'essay',
      content:
        '<p>Một người gửi $100$ triệu đồng theo lãi kép, lãi suất $6\\%$ một năm, lãi nhập gốc hằng năm. Hỏi sau ít nhất bao nhiêu năm thì số tiền thu được vượt $200$ triệu đồng? Trình bày lời giải bằng logarit.</p>',
      answerGuide:
        '<p>Ý cần có:</p><ul><li>Công thức lãi kép $T_n = A(1 + r)^n$ với $A = 100$, $r = 0{,}06$.</li><li>Bất phương trình $100 \\cdot 1{,}06^n &gt; 200 \\Leftrightarrow 1{,}06^n &gt; 2$.</li><li>Lấy logarit: $n &gt; \\dfrac{\\ln 2}{\\ln 1{,}06} \\approx 11{,}9$.</li><li>Vì $n$ nguyên nên $n = 12$ năm; nêu rõ bước làm tròn <strong>lên</strong> và lý do.</li></ul>',
    },

    // ── Tổ hợp – Xác suất ─────────────────────────────────────────────────
    {
      key: 'pb-01',
      module: MODULES.probability,
      difficulty: NB,
      type: 'single_choice',
      content: '<p>Số hoán vị của $n$ phần tử phân biệt là:</p>',
      options: ['$n!$', '$n^2$', '$2^n$', '$\\frac{n(n-1)}{2}$'],
      correctIndex: 0,
      explanation: '<p>Có $n$ cách chọn vị trí đầu, $n-1$ cách cho vị trí thứ hai… tích lại được $n!$.</p>',
    },
    {
      key: 'pb-02',
      module: MODULES.probability,
      difficulty: NB,
      type: 'single_choice',
      content: '<p>Công thức tổ hợp chập $k$ của $n$ phần tử là:</p>',
      options: [
        '$C_n^k = \\frac{n!}{k!\\,(n-k)!}$',
        '$C_n^k = \\frac{n!}{(n-k)!}$',
        '$C_n^k = n^k$',
        '$C_n^k = \\frac{k!}{n!}$',
      ],
      correctIndex: 0,
      explanation:
        '<p>Đáp án thứ hai là chỉnh hợp $A_n^k$ — có phân biệt thứ tự; tổ hợp thì không.</p>',
    },
    {
      key: 'pb-03',
      module: MODULES.probability,
      difficulty: TH,
      type: 'single_choice',
      content: '<p>Số cách chọn $3$ học sinh từ một nhóm $10$ học sinh là:</p>',
      options: ['$30$', '$120$', '$720$', '$1000$'],
      correctIndex: 1,
      explanation:
        '<p>$C_{10}^3 = \\dfrac{10 \\cdot 9 \\cdot 8}{3 \\cdot 2 \\cdot 1} = 120$.</p>',
    },
    {
      key: 'pb-04',
      module: MODULES.probability,
      difficulty: TH,
      type: 'single_choice',
      content:
        '<p>Gieo đồng thời hai con xúc xắc cân đối. Xác suất để tổng số chấm bằng $7$ là:</p>',
      options: ['$\\frac{1}{12}$', '$\\frac{1}{9}$', '$\\frac{1}{6}$', '$\\frac{7}{36}$'],
      correctIndex: 2,
      explanation:
        '<p>Có $6$ kết quả thuận lợi trong $36$ kết quả đồng khả năng, nên xác suất là $\\dfrac{6}{36} = \\dfrac{1}{6}$.</p>',
    },
    {
      key: 'pb-05',
      module: MODULES.probability,
      difficulty: VD,
      type: 'single_choice',
      content:
        '<p>Xếp $5$ học sinh nam và $3$ học sinh nữ thành một hàng ngang sao cho không có hai nữ nào đứng cạnh nhau. Số cách xếp là:</p>',
      options: [
        '$5! \\cdot A_6^3 = 14400$',
        '$8!$',
        '$5! \\cdot 3!$',
        '$C_6^3 \\cdot 3!$',
      ],
      correctIndex: 0,
      explanation:
        '<p>Xếp $5$ nam trước: $5!$ cách, tạo ra $6$ khoảng trống. Chọn và xếp $3$ nữ vào $6$ khoảng: $A_6^3$ cách. Tổng $120 \\cdot 120 = 14400$.</p>',
    },
    {
      key: 'pb-06',
      module: MODULES.probability,
      difficulty: VDC,
      type: 'essay',
      content:
        '<p>Một hộp có $6$ bi đỏ và $4$ bi xanh. Lấy ngẫu nhiên lần lượt $2$ bi, <strong>không hoàn lại</strong>. Tính xác suất để bi thứ hai là bi đỏ. Sau đó tính xác suất bi thứ nhất là đỏ, biết rằng bi thứ hai là đỏ.</p>',
      answerGuide:
        '<p>Ý cần có:</p><ul><li>Dùng công thức xác suất toàn phần: $P(D_2) = P(D_1)P(D_2|D_1) + P(X_1)P(D_2|X_1) = \\dfrac{6}{10}\\cdot\\dfrac{5}{9} + \\dfrac{4}{10}\\cdot\\dfrac{6}{9} = \\dfrac{54}{90} = \\dfrac{3}{5}$.</li><li>Nhận xét: $P(D_2) = P(D_1)$ — tính đối xứng của phép lấy không hoàn lại.</li><li>Bayes: $P(D_1|D_2) = \\dfrac{P(D_1)P(D_2|D_1)}{P(D_2)} = \\dfrac{\\frac{6}{10}\\cdot\\frac{5}{9}}{\\frac{3}{5}} = \\dfrac{5}{9}$.</li></ul>',
    },

    // ── Nguyên hàm – Tích phân ────────────────────────────────────────────
    {
      key: 'it-01',
      module: MODULES.integral,
      difficulty: NB,
      type: 'single_choice',
      content: '<p>Với $n \\ne -1$, họ nguyên hàm $\\displaystyle\\int x^n \\, dx$ bằng:</p>',
      options: [
        '$\\frac{x^{n+1}}{n+1} + C$',
        '$n x^{n-1} + C$',
        '$\\frac{x^n}{n} + C$',
        '$x^{n+1} + C$',
      ],
      correctIndex: 0,
      explanation: '<p>Kiểm tra bằng cách lấy đạo hàm vế phải sẽ ra $x^n$.</p>',
    },
    {
      key: 'it-02',
      module: MODULES.integral,
      difficulty: NB,
      type: 'single_choice',
      content:
        '<p>Nếu $F$ là một nguyên hàm của $f$ trên $[a; b]$ thì $\\displaystyle\\int_a^b f(x)\\,dx$ bằng:</p>',
      options: ['$F(b) - F(a)$', '$F(a) - F(b)$', '$F(b) + F(a)$', '$f(b) - f(a)$'],
      correctIndex: 0,
      explanation: '<p>Đây là công thức Newton – Leibniz.</p>',
    },
    {
      key: 'it-03',
      module: MODULES.integral,
      difficulty: TH,
      type: 'single_choice',
      content: '<p>Giá trị của $\\displaystyle\\int_0^1 (2x + 1)\\,dx$ là:</p>',
      options: ['$1$', '$2$', '$3$', '$\\frac{3}{2}$'],
      correctIndex: 1,
      explanation:
        '<p>$\\int_0^1 (2x+1)dx = \\big[x^2 + x\\big]_0^1 = (1 + 1) - 0 = 2$.</p>',
    },
    {
      key: 'it-04',
      module: MODULES.integral,
      difficulty: TH,
      type: 'single_choice',
      content: '<p>Họ nguyên hàm $\\displaystyle\\int e^{2x}\\,dx$ bằng:</p>',
      options: [
        '$\\frac{1}{2}e^{2x} + C$',
        '$2e^{2x} + C$',
        '$e^{2x} + C$',
        '$\\frac{e^{2x}}{2x} + C$',
      ],
      correctIndex: 0,
      explanation:
        '<p>Đổi biến $u = 2x$, $du = 2\\,dx$; hệ số $\\dfrac{1}{2}$ xuất hiện từ đó.</p>',
    },
    {
      key: 'it-05',
      module: MODULES.integral,
      difficulty: VD,
      type: 'single_choice',
      content:
        '<p>Diện tích hình phẳng giới hạn bởi hai đường $y = x^2$ và $y = x$ bằng:</p>',
      options: ['$\\frac{1}{6}$', '$\\frac{1}{3}$', '$\\frac{1}{2}$', '$1$'],
      correctIndex: 0,
      explanation:
        '<p>Hai đường cắt nhau tại $x = 0$ và $x = 1$; trên đoạn đó $x \\ge x^2$. Diện tích $= \\int_0^1 (x - x^2)dx = \\dfrac{1}{2} - \\dfrac{1}{3} = \\dfrac{1}{6}$.</p>',
    },
    {
      key: 'it-06',
      module: MODULES.integral,
      difficulty: VDC,
      type: 'essay',
      content:
        '<p>Tính thể tích khối tròn xoay tạo thành khi quay quanh trục $Ox$ hình phẳng giới hạn bởi đồ thị $y = \\sqrt{x}$, trục $Ox$ và hai đường thẳng $x = 0$, $x = 4$.</p>',
      answerGuide:
        '<p>Ý cần có:</p><ul><li>Công thức thể tích khối tròn xoay quanh $Ox$: $V = \\pi \\displaystyle\\int_a^b y^2 \\, dx$.</li><li>Thay $y^2 = x$: $V = \\pi \\displaystyle\\int_0^4 x \\, dx$.</li><li>Tính: $V = \\pi \\Big[\\dfrac{x^2}{2}\\Big]_0^4 = 8\\pi$ (đơn vị thể tích).</li><li>Trình bày rõ cận và kết luận kèm đơn vị.</li></ul>',
    },

    // ── Hình học không gian Oxyz ──────────────────────────────────────────
    {
      key: 'oz-01',
      module: MODULES.oxyz,
      difficulty: NB,
      type: 'single_choice',
      content:
        '<p>Mặt phẳng $(P): 2x - y + 3z - 1 = 0$ có một vector pháp tuyến là:</p>',
      options: [
        '$\\vec{n} = (2; -1; 3)$',
        '$\\vec{n} = (2; 1; 3)$',
        '$\\vec{n} = (-1; 3; -1)$',
        '$\\vec{n} = (1; 1; 1)$',
      ],
      correctIndex: 0,
      explanation:
        '<p>Với mặt phẳng $Ax + By + Cz + D = 0$, vector pháp tuyến là $(A; B; C)$.</p>',
    },
    {
      key: 'oz-02',
      module: MODULES.oxyz,
      difficulty: NB,
      type: 'single_choice',
      content: '<p>Khoảng cách giữa hai điểm $A(1; 0; 2)$ và $B(1; 4; 5)$ bằng:</p>',
      options: ['$3$', '$4$', '$5$', '$7$'],
      correctIndex: 2,
      explanation:
        '<p>$AB = \\sqrt{0^2 + 4^2 + 3^2} = \\sqrt{25} = 5$.</p>',
    },
    {
      key: 'oz-03',
      module: MODULES.oxyz,
      difficulty: TH,
      type: 'single_choice',
      content:
        '<p>Phương trình mặt cầu tâm $I(1; 2; 3)$, bán kính $R = 2$ là:</p>',
      options: [
        '$(x-1)^2 + (y-2)^2 + (z-3)^2 = 4$',
        '$(x+1)^2 + (y+2)^2 + (z+3)^2 = 4$',
        '$(x-1)^2 + (y-2)^2 + (z-3)^2 = 2$',
        '$x^2 + y^2 + z^2 = 4$',
      ],
      correctIndex: 0,
      explanation:
        '<p>Dạng chuẩn $(x - a)^2 + (y - b)^2 + (z - c)^2 = R^2$ với $R^2 = 4$.</p>',
    },
    {
      key: 'oz-04',
      module: MODULES.oxyz,
      difficulty: TH,
      type: 'single_choice',
      content:
        '<p>Cho $\\vec{u} = (1; 0; 0)$ và $\\vec{v} = (0; 1; 0)$. Tích có hướng $[\\vec{u}, \\vec{v}]$ bằng:</p>',
      options: ['$(0; 0; 1)$', '$(0; 0; -1)$', '$(1; 1; 0)$', '$(0; 0; 0)$'],
      correctIndex: 0,
      explanation:
        '<p>Tích có hướng cho vector vuông góc với cả hai; ở đây $\\vec{i} \\wedge \\vec{j} = \\vec{k} = (0;0;1)$.</p>',
    },
    {
      key: 'oz-05',
      module: MODULES.oxyz,
      difficulty: VD,
      type: 'single_choice',
      content:
        '<p>Khoảng cách từ điểm $M(1; 2; 3)$ đến mặt phẳng $(P): 2x - 2y + z + 3 = 0$ bằng:</p>',
      options: ['$\\frac{4}{3}$', '$\\frac{5}{3}$', '$2$', '$\\frac{7}{3}$'],
      correctIndex: 0,
      explanation:
        '<p>$d = \\dfrac{|2 \\cdot 1 - 2 \\cdot 2 + 3 + 3|}{\\sqrt{2^2 + (-2)^2 + 1^2}} = \\dfrac{|4|}{3} = \\dfrac{4}{3}$.</p>',
    },
    {
      key: 'oz-06',
      module: MODULES.oxyz,
      difficulty: VDC,
      type: 'essay',
      content:
        '<p>Trong không gian $Oxyz$ cho bốn điểm $A(1;0;0)$, $B(0;2;0)$, $C(0;0;3)$ và $D(1;2;3)$. Viết phương trình mặt phẳng $(ABC)$ và tính thể tích khối tứ diện $ABCD$.</p>',
      answerGuide:
        '<p>Ý cần có:</p><ul><li>Dùng phương trình mặt phẳng theo đoạn chắn: $\\dfrac{x}{1} + \\dfrac{y}{2} + \\dfrac{z}{3} = 1$, quy đồng thành $6x + 3y + 2z - 6 = 0$.</li><li>Tính thể tích bằng $V = \\dfrac{1}{6}\\big|[\\vec{AB}, \\vec{AC}] \\cdot \\vec{AD}\\big|$, hoặc $V = \\dfrac{1}{3} S_{ABC} \\cdot d(D, (ABC))$.</li><li>$\\vec{AB} = (-1;2;0)$, $\\vec{AC} = (-1;0;3)$, $\\vec{AD} = (0;2;3)$; tích hỗn tạp cho $|{-}6|$, suy ra $V = 1$ (đơn vị thể tích).</li><li>Trình bày rõ từng bước và kết luận kèm đơn vị.</li></ul>',
    },
  ],
  exams: [
    {
      key: 'exam-dv',
      title: 'Luyện tập: Hàm số và đạo hàm',
      module: MODULES.derivative,
      modules: [MODULES.derivative],
      blueprint: { [NB]: 1, [TH]: 2, [VD]: 1 },
    },
    {
      key: 'exam-lg',
      title: 'Luyện tập: Mũ và logarit',
      module: MODULES.logarithm,
      modules: [MODULES.logarithm],
      blueprint: { [NB]: 1, [TH]: 2, [VD]: 1 },
    },
    {
      key: 'exam-pb',
      title: 'Luyện tập: Tổ hợp – Xác suất',
      module: MODULES.probability,
      modules: [MODULES.probability],
      blueprint: { [NB]: 1, [TH]: 2, [VD]: 1 },
    },
    {
      key: 'exam-it',
      title: 'Luyện tập: Nguyên hàm – Tích phân',
      module: MODULES.integral,
      modules: [MODULES.integral],
      blueprint: { [NB]: 1, [TH]: 2, [VD]: 1 },
    },
    {
      key: 'exam-oz',
      title: 'Luyện tập: Hình học không gian Oxyz',
      module: MODULES.oxyz,
      modules: [MODULES.oxyz],
      blueprint: { [NB]: 1, [TH]: 2, [VD]: 1 },
    },
    {
      key: 'exam-mid',
      title: 'Đề kiểm tra giữa khoá — Giải tích',
      module: MODULES.review,
      modules: [MODULES.derivative, MODULES.logarithm, MODULES.probability],
      blueprint: { [NB]: 3, [TH]: 4, [VD]: 2, [VDC]: 1 },
    },
    {
      key: 'exam-final',
      title: 'Đề thi thử THPT — Tổng hợp',
      module: MODULES.review,
      blueprint: { [NB]: 5, [TH]: 6, [VD]: 3, [VDC]: 1 },
    },
    {
      key: 'exam-warmup',
      title: 'Đề khởi động — Kiểm tra 10 phút',
      module: MODULES.review,
      blueprint: { [NB]: 5 },
    },
    {
      key: 'exam-cluster-2',
      title: 'Đề kiểm tra cụm 2 — Tích phân & Hình học Oxyz',
      module: MODULES.review,
      modules: [MODULES.integral, MODULES.oxyz],
      blueprint: { [NB]: 2, [TH]: 2, [VD]: 1, [VDC]: 1 },
    },
    {
      key: 'exam-advanced',
      title: 'Đề nâng cao — Vận dụng & Vận dụng cao',
      module: MODULES.review,
      blueprint: { [VD]: 5, [VDC]: 2 },
    },
    {
      key: 'exam-essay',
      title: 'Đề tự luận — Trình bày lời giải',
      module: MODULES.review,
      blueprint: { [VDC]: 5 },
    },
    {
      // `rotate: 1` = lấy khối câu kế tiếp của `exam-final`, để hai đề thi thử không trùng câu.
      key: 'exam-final-2',
      title: 'Đề thi thử THPT (đề số 2) — Tổng hợp',
      module: MODULES.review,
      blueprint: { [NB]: 5, [TH]: 6, [VD]: 3, [VDC]: 1 },
      rotate: 1,
    },
  ],
};
