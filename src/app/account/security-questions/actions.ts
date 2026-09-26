'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ROLE_HOME, type Role } from '@/lib/auth/routing';

export interface QuestionsState {
  error?: string;
  message?: string;
}

// Two questions, and a reset must answer both.
const schema = z.object({
  question_1: z.coerce.number().int().min(1),
  answer_1: z.string().trim().min(2, 'Answers must be at least 2 characters.'),
  question_2: z.coerce.number().int().min(1),
  answer_2: z.string().trim().min(2, 'Answers must be at least 2 characters.'),
});

export async function saveSecurityQuestions(_prev: QuestionsState, formData: FormData): Promise<QuestionsState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Choose two questions and answer both.' };
  const input = parsed.data;
  if (input.question_1 === input.question_2) return { error: 'Choose two different questions.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Answers are hashed by set_security_answer inside the database; nothing is stored in clear.
  const admin = createAdminClient();
  const { error: clearError } = await admin.from('security_answers').delete().eq('user_id', user.id);
  if (clearError) return { error: clearError.message };
  for (const [question, answer] of [
    [input.question_1, input.answer_1],
    [input.question_2, input.answer_2],
  ] as const) {
    const { error } = await admin.rpc('set_security_answer', { p_user: user.id, p_question: question, p_answer: answer });
    if (error) return { error: error.message };
  }
  await supabase.rpc('log_audit', { p_action: 'auth.security_questions_set', p_entity: 'profiles', p_entity_id: user.id, p_payload: {} });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  redirect(profile ? ROLE_HOME[profile.role as Role] : '/');
}
