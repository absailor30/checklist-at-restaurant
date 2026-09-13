import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level');

    let query = supabase
      .from('line_check_questions')
      .select('*')
      .order('sort_order');

    if (level) {
      query = query.eq('level', level);
    } else {
      query = query.in('level', ['L2', 'L3']);
    }

    const { data: questions, error } = await query;

    if (error) throw error;

    return NextResponse.json({ questions });
  } catch (error: any) {
    console.error('Questions error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
