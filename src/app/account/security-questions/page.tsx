import { AuthFrame } from '@/components/auth-frame';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { QuestionsForm, type Question } from './questions-form';

export const metadata = { title: 'Security questions — SSU ODL' };

export default async function SecurityQuestionsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: questions } = await supabase.from('security_questions').select('id, prompt').order('id');
  // Which two they already chose, so the selects come up on their own answers.
  const { data: chosen } = await createAdminClient().from('security_answers').select('question_id').eq('user_id', user.id).order('question_id');

  return (
    <AuthFrame
      title="Security questions"
      intro={
        <>
          Choose two questions and answer them. If you ever forget your password, these let you set a new one yourself — nothing is emailed. Capital letters and
          extra spaces are ignored when you answer.
        </>
      }
    >
      <QuestionsForm questions={(questions ?? []) as Question[]} chosen={((chosen ?? []) as { question_id: number }[]).map((c) => c.question_id)} />
    </AuthFrame>
  );
}
