import { PaymentStatus } from '../../generated/enums';
import { computeTrainingManagerSessionSnapshot } from './training-manager.utils';

describe('computeTrainingManagerSessionSnapshot', () => {
  it('uses session tuition total from attendance tuition_fee (including block-priced retail)', () => {
    expect(
      computeTrainingManagerSessionSnapshot({
        sessionTuitionTotal: 240000,
        trainingManagerStaffId: 'tm-1',
        trainingManagerRatePercent: 5,
      }),
    ).toEqual({
      trainingManagerStaffId: 'tm-1',
      trainingManagerRatePercent: 5,
      trainingManagerAllowanceAmount: 12000,
      trainingManagerPaymentStatus: PaymentStatus.pending,
    });
  });
});
