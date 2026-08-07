-- ============================================================
-- 0062: 生徒ノートを「その日の印象」に作り替える
--
-- 記録したいものの単位 (chimo 2026-08-07):
--   「1人の先生が、1人の生徒について、その日感じた印象」
--   気軽に残せるよう **サイン (Good / 気になる) だけでもよく**、
--   余裕があればコメントも書く。
--
-- これまでは2つに割れていて、どちらも「今日の印象」を表せていなかった:
--   student_reactions : 教員×生徒×種別の**トグル**。日付の概念が無く、
--                       一度 Good を付けるとずっと Good のままだった。
--   baton_notes       : 教員×生徒×日付×本文。日付はあるが**種別が無く**、
--                       本文必須なのでサインだけを残せなかった。
--
-- そこで baton_notes に sign を足して1行で表せるようにし、
-- student_reactions は廃止して既存データを移す。
--
-- append-only は維持する (chimo 判断)。同じ先生が同じ日に何度でも足せる
-- ＝ 朝と放課後で印象が変わったことをそのまま残せる。
--
-- テーブル名は baton_notes のまま据え置く。機能名 (baton-relay / 生徒ノート) を
-- 変えるスコープではないため。中身の意味はこのコメントを正本とする。
-- ============================================================

-- ── sign (その日の印象) ──────────────────────────────────────
CREATE TYPE student_impression_sign AS ENUM ('good', 'concern');

-- 既存行には sign が無いので NULL 許容。新規入力では API/Zod 側で必須にする。
ALTER TABLE baton_notes ADD COLUMN sign student_impression_sign;

-- サインだけを残せるように、本文を任意にする。
ALTER TABLE baton_notes ALTER COLUMN content DROP NOT NULL;

-- ただし「サインも本文も無い」空の行は作らせない。
ALTER TABLE baton_notes ADD CONSTRAINT baton_notes_sign_or_content CHECK (
  sign IS NOT NULL OR (content IS NOT NULL AND length(content) > 0)
);

CREATE INDEX baton_notes_sign_idx ON baton_notes(tenant_id, sign);

-- ── 既存の「印」を印象の行へ移す ─────────────────────────────
-- トグル1行 → 付けた日の「サインだけの印象」1行として移す。
-- 日付は JST の暦日 (アプリが note_date を JST で扱っているため)。
INSERT INTO baton_notes (
  tenant_id, student_id, author_user_id, note_date, sign, content, created_at, updated_at
)
SELECT
  r.tenant_id,
  r.student_id,
  r.user_id,
  (r.created_at AT TIME ZONE 'Asia/Tokyo')::date,
  CASE r.reaction_type
    WHEN 'positive' THEN 'good'::student_impression_sign
    ELSE 'concern'::student_impression_sign
  END,
  NULL,
  r.created_at,
  r.created_at
FROM student_reactions r;

-- ── 印テーブルを廃止 ─────────────────────────────────────────
DROP TABLE student_reactions;
DROP TYPE student_reaction_type;
