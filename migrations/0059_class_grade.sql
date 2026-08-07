-- ============================================================
-- 0059: classes に学年 (grade) を追加
--
-- 学年会 (grade_meetings・0060) でクラスをまとめる軸。
-- これまで classes は自由文字列の name しか持たず、「1年でまとめる」軸が
-- 存在しなかった (name から推測すると「ひまわり組」等で破綻する)。
--
-- 教員グループ (学年団) のテーブルは作らない。
-- 「学年団 = その学年のクラスを見る先生たち」として暗黙に扱う。
--
-- NULL 許容: 既存クラスにバックフィルを強制しない。
-- 学年未設定のクラスは学年会の対象に出さず、名簿画面から後で設定する。
-- ============================================================

ALTER TABLE classes ADD COLUMN grade INTEGER;

-- 学年の妥当な範囲 (小1〜高3を想定)。NULL は許容。
ALTER TABLE classes ADD CONSTRAINT classes_grade_range CHECK (
  grade IS NULL OR (grade >= 1 AND grade <= 12)
);

-- 学年会は「テナント × 学年」でクラスを引く
CREATE INDEX classes_tenant_grade_idx ON classes(tenant_id, grade);
