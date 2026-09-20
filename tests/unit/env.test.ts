import { describe, expect, it } from 'vitest';
import { appConfig } from '@/lib/env';

describe('appConfig defaults', () => {
  it('uses Asia/Kolkata and the spec defaults when env is unset', () => {
    expect(appConfig.timezone).toBe('Asia/Kolkata');
    expect(appConfig.joinWindowLeadMinutes).toBe(10);
    expect(appConfig.recordingRetentionDays).toBe(30);
    expect(appConfig.sessionGenerationHorizonDays).toBe(21);
    expect(appConfig.allowedStudentDomain).toBe('srisriuniversity.edu.in');
  });
});
