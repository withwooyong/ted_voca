-- Ted Voca — Initial Schema (v0)
-- Apply: supabase db push OR run in Supabase SQL Editor

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE learning_goal AS ENUM ('exam', 'conversation', 'business');
CREATE TYPE word_pos AS ENUM ('noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'other');
CREATE TYPE study_module AS ENUM ('vocab', 'grammar', 'listening', 'speaking');
CREATE TYPE quiz_type AS ENUM ('blank', 'multiple_choice', 'spelling', 'translation_en_ko', 'translation_ko_en');

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  goal learning_goal DEFAULT 'exam',
  daily_goal_minutes INT DEFAULT 10 CHECK (daily_goal_minutes IN (5, 10, 20)),
  onboarding_complete BOOLEAN DEFAULT FALSE,
  user_level TEXT DEFAULT 'A2',
  weak_tags TEXT[] DEFAULT '{}',
  xp INT DEFAULT 0,
  streak INT DEFAULT 0,
  level INT DEFAULT 1,
  last_study_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Courses
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  word_count INT DEFAULT 0,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Words
CREATE TABLE words (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  lemma TEXT NOT NULL,
  pos word_pos DEFAULT 'other',
  meaning_ko TEXT NOT NULL,
  meaning_en TEXT,
  example_en TEXT,
  example_ko TEXT,
  phonetic TEXT,
  tags TEXT[] DEFAULT '{}',
  difficulty INT DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (course_id, lemma)
);

CREATE INDEX idx_words_course ON words(course_id);
CREATE INDEX idx_words_lemma ON words(lemma);

-- User word progress (SRS state)
CREATE TABLE user_words (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  ease_factor REAL DEFAULT 2.5,
  interval_days INT DEFAULT 0,
  repetitions INT DEFAULT 0,
  next_review_at TIMESTAMPTZ DEFAULT NOW(),
  correct_streak INT DEFAULT 0,
  total_reviews INT DEFAULT 0,
  total_correct INT DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'learning' CHECK (status IN ('new', 'learning', 'review', 'mastered')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, word_id)
);

CREATE INDEX idx_user_words_review ON user_words(user_id, next_review_at);
CREATE INDEX idx_user_words_user ON user_words(user_id);

-- Study sessions
CREATE TABLE study_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module study_module NOT NULL,
  course_id UUID REFERENCES courses(id),
  xp_earned INT DEFAULT 0,
  items_completed INT DEFAULT 0,
  items_correct INT DEFAULT 0,
  duration_seconds INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_study_sessions_user ON study_sessions(user_id, started_at DESC);

-- Quiz attempts
CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES study_sessions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  word_id UUID REFERENCES words(id) ON DELETE SET NULL,
  quiz_type quiz_type NOT NULL,
  is_correct BOOLEAN NOT NULL,
  response_ms INT,
  user_answer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quiz_attempts_user ON quiz_attempts(user_id, created_at DESC);

-- Grammar (P3 placeholder tables)
CREATE TABLE grammar_topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  cefr_level TEXT,
  explanation TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE grammar_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID REFERENCES grammar_topics(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB,
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Listening (P4 placeholder)
CREATE TABLE listening_clips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID REFERENCES courses(id),
  title TEXT NOT NULL,
  transcript_en TEXT NOT NULL,
  transcript_ko TEXT,
  duration_seconds INT,
  difficulty INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Speaking scenarios (P5 placeholder)
CREATE TABLE speaking_scenarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  context TEXT,
  difficulty INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dialogue_turns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_id UUID REFERENCES speaking_scenarios(id) ON DELETE CASCADE,
  turn_order INT NOT NULL,
  speaker TEXT NOT NULL,
  text_en TEXT NOT NULL,
  hint_ko TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- League (P6 placeholder)
CREATE TABLE league_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  xp INT DEFAULT 0,
  tier TEXT DEFAULT 'bronze',
  rank INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, week_start)
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_words_updated_at
  BEFORE UPDATE ON user_words
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_entries ENABLE ROW LEVEL SECURITY;

-- Profiles: users read/update own
CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (auth.uid() = id);

-- User words: users CRUD own
CREATE POLICY user_words_select_own ON user_words FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_words_insert_own ON user_words FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_words_update_own ON user_words FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY user_words_delete_own ON user_words FOR DELETE USING (auth.uid() = user_id);

-- Study sessions
CREATE POLICY study_sessions_select_own ON study_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY study_sessions_insert_own ON study_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY study_sessions_update_own ON study_sessions FOR UPDATE USING (auth.uid() = user_id);

-- Quiz attempts
CREATE POLICY quiz_attempts_select_own ON quiz_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY quiz_attempts_insert_own ON quiz_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- League
CREATE POLICY league_select_own ON league_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY league_insert_own ON league_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY league_update_own ON league_entries FOR UPDATE USING (auth.uid() = user_id);

-- Public read for content tables
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE words ENABLE ROW LEVEL SECURITY;
ALTER TABLE grammar_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE grammar_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaking_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialogue_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY courses_read_all ON courses FOR SELECT TO authenticated USING (is_active = TRUE);
CREATE POLICY words_read_all ON words FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY grammar_topics_read_all ON grammar_topics FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY grammar_questions_read_all ON grammar_questions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY listening_clips_read_all ON listening_clips FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY speaking_scenarios_read_all ON speaking_scenarios FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY dialogue_turns_read_all ON dialogue_turns FOR SELECT TO authenticated USING (TRUE);

-- Seed default course
INSERT INTO courses (slug, title, description, word_count, sort_order)
VALUES ('toeic-800', 'TOEIC 800', '토익 800점 목표 핵심 어휘', 500, 1);
