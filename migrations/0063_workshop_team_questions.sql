-- ============================================================
-- 0063: チーム振り返りの設問を「正解がない複雑な課題に向き合う3条件」に張り替える
--
-- 研修資料 (差し替え後) のスライドが、課題に向き合う条件を3つ示している:
--   ① 共に目指したいビジョンが明確で、すり合っている
--   ② 共に働く人の価値観や前提を尊重する
--   ③ 一人一人が自律的に取り組む
--
-- チーム振り返りはこれまで OODA の周回 (変化 / チームだから起きた瞬間 / 合言葉) を
-- 軸にしていたが、スライドの問いと軸がズレていた。3条件に紐づける (chimo 2026-08-10)。
--
-- カラム名も意味に合わせて改名する。RENAME COLUMN は値を保持するので、
-- 既にデータがあっても失われない。
--   team_change → team_vision    ① 何を目指すと決めたか
--   team_moment → team_respect   ② ちがう観察や解釈をどう扱ったか
--   team_motto  → team_autonomy  ③ 役割や経験によらず動けたか
--   team_next   → (そのまま)      ④ 仕事で活かせること (ポスターの主役)
-- ============================================================

ALTER TABLE workshop_team_reflections RENAME COLUMN team_change TO team_vision;
ALTER TABLE workshop_team_reflections RENAME COLUMN team_moment TO team_respect;
ALTER TABLE workshop_team_reflections RENAME COLUMN team_motto TO team_autonomy;

-- 長さ制限の CHECK も改名後の列を見るように張り直す
ALTER TABLE workshop_team_reflections
  DROP CONSTRAINT workshop_team_reflections_length;
ALTER TABLE workshop_team_reflections
  ADD CONSTRAINT workshop_team_reflections_length CHECK (
    length(team_vision)   <= 2000
    AND length(team_respect)  <= 2000
    AND length(team_autonomy) <= 2000
    AND length(team_next)     <= 2000
  );
