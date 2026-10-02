import { AttemptExpiryJob } from './attempt-expiry.job';

describe('AttemptExpiryJob', () => {
  it('delegates to finalizeExpiredInProgress without starting a timer', async () => {
    const attemptService = {
      finalizeExpiredInProgress: jest.fn().mockResolvedValue(0),
    };
    const job = new AttemptExpiryJob(attemptService as never);
    await job.handleCron();
    expect(attemptService.finalizeExpiredInProgress).toHaveBeenCalledTimes(1);
  });
});
