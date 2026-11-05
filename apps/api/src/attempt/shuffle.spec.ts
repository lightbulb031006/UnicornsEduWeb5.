import { AttemptScoring, QuestionSlot, QuestionType } from 'generated/enums';
import { gradeAnswers } from './grading';
import {
  isPositionDependent,
  orderingKeyOf,
  reorderForKey,
  groupByMaterial,
  seededRng,
  shuffleMaterialBlocks,
  shuffleOrderingCards,
  remapAnswerKey,
  shuffleQuestionOptions,
  shuffledIndices,
  shuffleWithinGroups,
} from './shuffle';

/** RNG cố định: Fisher–Yates với rng() = 0 luôn đổi phần tử i với vị trí 0. */
const zero = () => 0;

describe('shuffledIndices', () => {
  it('luôn là hoán vị của 0..n-1', () => {
    for (let n = 0; n < 8; n++) {
      expect([...shuffledIndices(n)].sort()).toEqual(
        Array.from({ length: n }, (_, i) => i),
      );
    }
  });

  it('xác định khi truyền rng', () => {
    expect(shuffledIndices(4, zero)).toEqual([1, 2, 3, 0]);
  });
});

describe('shuffleWithinGroups', () => {
  it('giữ thứ tự nhóm, chỉ xáo trong đoạn cùng nhóm', () => {
    const items = ['a1', 'a2', 'a3', 'b1', 'c1', 'c2'];
    const out = shuffleWithinGroups(items, (s) => s[0], zero);
    expect(out.map((s) => s[0])).toEqual(['a', 'a', 'a', 'b', 'c', 'c']);
    expect(out.slice(0, 3)).toEqual(['a2', 'a3', 'a1']);
    expect(out.slice(4)).toEqual(['c2', 'c1']);
  });
});

describe('isPositionDependent', () => {
  it.each([
    'Không có lĩnh vực nào ở trên',
    'Tất cả các đáp án đều đúng',
    'Cả A và B',
    'A, C',
    'Phương án B sai',
    'Không có đáp án nào đúng',
    'Cả hai ý đều sai',
    'Kết luận ở ý a là sai',
    '<p>Các phương án nêu&nbsp;trên</p>',
    'None of the above',
  ])('bắt: %s', (text) => {
    expect(isPositionDependent(['x', text])).toBe(true);
  });

  it.each([
    'Máy in',
    'Bàn phím và chuột',
    'Giao thức HTTP',
    'Cả lớp cùng làm',
    'Mảng A có 5 phần tử',
    'Trên mạng LAN',
  ])('không bắt: %s', (text) => {
    expect(isPositionDependent(['x', text])).toBe(false);
  });
});

describe('remapAnswerKey', () => {
  it('rỗng = giữ nguyên', () => {
    expect(remapAnswerKey([], { correctIndex: 2 })).toEqual({
      correctIndex: 2,
    });
  });

  it('đổi correctIndex và tfAnswerKey sang thứ tự hiển thị', () => {
    expect(
      remapAnswerKey([2, 0, 3, 1], {
        correctIndex: 0,
        tfAnswerKey: [true, false, false, true],
      }),
    ).toEqual({ correctIndex: 1, tfAnswerKey: [false, true, true, false] });
  });
});

describe('shuffleQuestionOptions', () => {
  const base = {
    type: QuestionType.single_choice,
    options: ['A0', 'A1', 'A2', 'A3'],
    correctIndex: 2,
    tfAnswerKey: [],
  };

  it('xáo phương án, phương án đúng đi theo', () => {
    const r = shuffleQuestionOptions(base, zero)!;
    expect(r.optionOrder).toEqual([1, 2, 3, 0]);
    expect(r.options).toEqual(['A1', 'A2', 'A3', 'A0']);
    expect(r.options[r.correctIndex!]).toBe('A2');
  });

  it('Đúng/Sai: đáp án nhận định đi theo', () => {
    const r = shuffleQuestionOptions(
      {
        type: QuestionType.true_false_group,
        options: ['s0', 's1', 's2', 's3'],
        correctIndex: null,
        tfAnswerKey: [true, true, false, false],
      },
      zero,
    )!;
    expect(r.options).toEqual(['s1', 's2', 's3', 's0']);
    expect(r.tfAnswerKey).toEqual([true, false, false, true]);
    expect(r.correctIndex).toBeNull();
  });

  it('không xáo: tự luận, options lạ, phương án nhắc vị trí', () => {
    expect(
      shuffleQuestionOptions({ ...base, type: QuestionType.essay }),
    ).toBeNull();
    expect(shuffleQuestionOptions({ ...base, options: null })).toBeNull();
    expect(
      shuffleQuestionOptions({ ...base, options: ['x', 'Cả A và B'] }),
    ).toBeNull();
  });

  it('Câu Đúng/Sai (JP): hai lựa chọn Đúng/Sai không bị xáo', () => {
    expect(
      shuffleQuestionOptions({
        type: QuestionType.true_false,
        options: null,
        correctIndex: null,
        tfAnswerKey: [true],
      }),
    ).toBeNull();
  });

  it('câu điền vào ô trống không xáo (ô theo thứ tự đề)', () => {
    expect(
      shuffleQuestionOptions({
        type: QuestionType.fill_blank,
        options: null,
        correctIndex: null,
        tfAnswerKey: [],
      }),
    ).toBeNull();
  });
});

describe('đảo không đổi điểm (so với đề gốc)', () => {
  /** RNG giả ngẫu nhiên có seed để test lặp lại được. */
  function seeded(seed: number) {
    return () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
  }
  const rng = seeded(42);
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)];

  it('trắc nghiệm: chọn cùng phương án (theo nội dung) → cùng kết quả', () => {
    for (let run = 0; run < 500; run++) {
      const options = ['p0', 'p1', 'p2', 'p3'];
      const correctIndex = Math.floor(rng() * 4);
      const chosenOriginal = pick([null, 0, 1, 2, 3]);
      const s = shuffleQuestionOptions(
        {
          type: QuestionType.single_choice,
          options,
          correctIndex,
          tfAnswerKey: [],
        },
        rng,
      )!;
      // Học sinh bấm vào phương án có nội dung options[chosenOriginal].
      const chosenDisplay =
        chosenOriginal === null
          ? null
          : s.options.indexOf(options[chosenOriginal]);
      const base = {
        id: 'a',
        slot: QuestionSlot.required,
        pointsPossible: 25,
        tfChoices: null,
      };
      const original = gradeAnswers(
        [
          {
            ...base,
            type: QuestionType.single_choice,
            choiceIndex: chosenOriginal,
            correctIndex,
            tfAnswerKey: [],
          },
        ],
        AttemptScoring.absolute_it,
      );
      const shuffled = gradeAnswers(
        [
          {
            ...base,
            type: QuestionType.single_choice,
            choiceIndex: chosenDisplay,
            correctIndex: s.correctIndex,
            tfAnswerKey: s.tfAnswerKey,
          },
        ],
        AttemptScoring.absolute_it,
      );
      expect(shuffled.patches).toEqual(original.patches);
    }
  });

  it('Đúng/Sai: chọn cùng đáp án từng nhận định → cùng điểm bậc thang', () => {
    for (let run = 0; run < 500; run++) {
      const options = ['s0', 's1', 's2', 's3'];
      const key = options.map(() => rng() < 0.5);
      const choicesOriginal = options.map(() => pick([true, false, null]));
      const s = shuffleQuestionOptions(
        {
          type: QuestionType.true_false_group,
          options,
          correctIndex: null,
          tfAnswerKey: key,
        },
        rng,
      )!;
      const choicesDisplay = s.optionOrder.map((orig) => choicesOriginal[orig]);
      const base = {
        id: 'a',
        slot: QuestionSlot.required,
        pointsPossible: 100,
        choiceIndex: null,
        correctIndex: null,
      };
      const original = gradeAnswers(
        [
          {
            ...base,
            type: QuestionType.true_false_group,
            tfChoices: choicesOriginal,
            tfAnswerKey: key,
          },
        ],
        AttemptScoring.absolute_it,
      );
      const shuffled = gradeAnswers(
        [
          {
            ...base,
            type: QuestionType.true_false_group,
            tfChoices: choicesDisplay,
            tfAnswerKey: s.tfAnswerKey,
          },
        ],
        AttemptScoring.absolute_it,
      );
      expect(shuffled.patches).toEqual(original.patches);
      expect(shuffled.autoGradedScore).toBe(original.autoGradedScore);
    }
  });

  it('chấm lại: đáp án mới qua remap khớp với xáo lại từ đầu', () => {
    for (let run = 0; run < 200; run++) {
      const optionOrder = shuffledIndices(4, rng);
      const newCorrect = Math.floor(rng() * 4);
      const newKey = [0, 1, 2, 3].map(() => rng() < 0.5);
      const r = remapAnswerKey(optionOrder, {
        correctIndex: newCorrect,
        tfAnswerKey: newKey,
      });
      expect(optionOrder[r.correctIndex!]).toBe(newCorrect);
      r.tfAnswerKey!.forEach((v, i) => expect(v).toBe(newKey[optionOrder[i]]));
    }
  });

  it('chấm lại: phương án đúng không có trong snapshot → null', () => {
    expect(
      remapAnswerKey([2, 0, 3, 1], { correctIndex: 4 }).correctIndex,
    ).toBeNull();
  });
});

describe('shuffleOrderingCards', () => {
  it('xáo thẻ, optionOrder trỏ về vị trí gốc', () => {
    const cards = ['私は', '毎日', '学校へ', '行きます'];
    for (let seed = 0; seed < 20; seed++) {
      const r = shuffleOrderingCards(cards);
      expect(r.optionOrder.map((i) => cards[i])).toEqual(r.options);
      expect([...r.optionOrder].sort()).toEqual([0, 1, 2, 3]);
      // Không bao giờ hiện đúng thứ tự đáp án.
      expect(r.options).not.toEqual(cards);
    }
  });

  it('rng trả hoán vị đơn vị vẫn bị đổi', () => {
    // rng() = 0.999… → Fisher–Yates giữ nguyên thứ tự.
    const r = shuffleOrderingCards(['a', 'b', 'c'], () => 0.9999);
    expect(r.options).not.toEqual(['a', 'b', 'c']);
  });

  it('mọi thẻ cùng chữ thì không thể khác, trả nguyên', () => {
    const r = shuffleOrderingCards(['の', 'の'], () => 0.9999);
    expect(r.options).toEqual(['の', 'の']);
  });
});

describe('orderingKeyOf / reorderForKey', () => {
  it('lấy lại thứ tự đúng từ snapshot đã xáo', () => {
    expect(orderingKeyOf(['c', 'a', 'b'], [2, 0, 1])).toEqual(['a', 'b', 'c']);
  });
  it('đổi thứ tự đúng, cùng bộ thẻ → optionOrder mới; khác bộ thẻ → null', () => {
    const order = reorderForKey(['c', 'a', 'b'], ['b', 'c', 'a']);
    expect(order).toEqual([1, 2, 0]);
    expect(orderingKeyOf(['c', 'a', 'b'], order!)).toEqual(['b', 'c', 'a']);
    expect(reorderForKey(['c', 'a', 'b'], ['a', 'b', 'x'])).toBeNull();
    expect(reorderForKey(['c', 'a', 'b'], ['a', 'b'])).toBeNull();
  });
  it('thẻ trùng chữ ghép được', () => {
    const order = reorderForKey(['の', '本', 'の'], ['の', 'の', '本']);
    expect(orderingKeyOf(['の', '本', 'の'], order!)).toEqual([
      'の',
      'の',
      '本',
    ]);
  });
});

describe('seededRng', () => {
  it('cùng seed cho cùng dãy, giá trị trong [0, 1)', () => {
    const a = seededRng('student-1:question-1');
    const b = seededRng('student-1:question-1');
    const xs = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('seed khác cho dãy khác', () => {
    const a = seededRng('student-1:question-1');
    const b = seededRng('student-2:question-1');
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(
      Array.from({ length: 5 }, () => b()),
    );
  });
});

describe('Tư liệu dùng chung — khối câu', () => {
  type Item = { id: string; material: string | null; position: number };
  const item = (
    id: string,
    material: string | null = null,
    position = Number(id.replace(/\D/g, '')) || 0,
  ): Item => ({ id, material, position });
  const ids = (items: Item[]) => items.map((i) => i.id);
  const materialOf = (i: Item) =>
    i.material === null ? null : { setId: i.material, position: i.position };

  it('kéo các câu cùng tư liệu về liền nhau tại vị trí câu đầu tiên, giữ thứ tự người soạn', () => {
    const items = [
      item('a'),
      item('r1', 'R'),
      item('b'),
      item('r2', 'R'),
      item('l1', 'L'),
      item('r3', 'R'),
      item('l2', 'L'),
    ];
    expect(ids(groupByMaterial(items, materialOf))).toEqual([
      'a',
      'r1',
      'r2',
      'r3',
      'b',
      'l1',
      'l2',
    ]);
  });

  it('trong khối xếp theo thứ tự của bộ, không theo thứ tự trong tiết', () => {
    const items = [
      item('a'),
      item('r3', 'R'),
      item('r1', 'R'),
      item('b'),
      item('r2', 'R'),
    ];
    expect(ids(groupByMaterial(items, materialOf))).toEqual([
      'a',
      'r1',
      'r2',
      'r3',
      'b',
    ]);
    const shuffled = ids(shuffleMaterialBlocks(items, materialOf, () => 0));
    const start = shuffled.indexOf('r1');
    expect(shuffled.slice(start, start + 3)).toEqual(['r1', 'r2', 'r3']);
  });

  it('đảo câu xáo khối như một đơn vị, bên trong khối giữ thứ tự', () => {
    const items = [
      item('a'),
      item('r1', 'R'),
      item('r2', 'R'),
      item('r3', 'R'),
      item('b'),
    ];
    // rng = 0 → Fisher–Yates đưa đơn vị cuối lên đầu: [a, R, b] → [R, b, a].
    const out = ids(shuffleMaterialBlocks(items, materialOf, () => 0));
    expect(out).toEqual(['r1', 'r2', 'r3', 'b', 'a']);
  });

  it('khối luôn liền nhau và giữ thứ tự với rng bất kỳ', () => {
    const items = [
      item('r1', 'R'),
      item('a'),
      item('r2', 'R'),
      item('b'),
      item('r3', 'R'),
      item('c'),
    ];
    for (let seed = 0; seed < 20; seed++) {
      const out = ids(
        shuffleMaterialBlocks(items, materialOf, seededRng(String(seed))),
      );
      const start = out.indexOf('r1');
      expect(out.slice(start, start + 3)).toEqual(['r1', 'r2', 'r3']);
      expect([...out].sort()).toEqual(['a', 'b', 'c', 'r1', 'r2', 'r3']);
    }
  });
});
