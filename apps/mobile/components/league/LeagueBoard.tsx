/**
 * 리그 보드 렌더 컴포넌트 (데이터 주입형) — plan p6 §6.
 * board(rank 부여 완료)·myRank·승급선/강등선을 렌더한다.
 * 데이터 로딩은 부모(app/league.tsx)가 담당.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import {
  LEAGUE_DEMOTE_COUNT,
  LEAGUE_PROMOTE_COUNT,
  type LeagueTier,
  type RankedEntry,
} from '@ted-voca/shared';

const TIER_META: Record<LeagueTier, { emoji: string; label: string }> = {
  bronze: { emoji: '🥉', label: '브론즈' },
  silver: { emoji: '🥈', label: '실버' },
  gold: { emoji: '🥇', label: '골드' },
};

type Props = {
  board: RankedEntry[];
  myUserId: string;
  tier: LeagueTier;
};

export function LeagueBoard({ board, myUserId, tier }: Props) {
  const meta = TIER_META[tier];
  const groupSize = board.length;

  // 승급선: promoteLineRank(10위) 행 아래. board가 10명 미만이면 마지막 행 아래.
  const promoteLineRank = Math.min(LEAGUE_PROMOTE_COUNT, groupSize);
  // 강등선: demoteLineRank 위. groupSize <= DEMOTE면 표시 안 함(0).
  const demoteLineRank =
    groupSize <= LEAGUE_DEMOTE_COUNT ? 0 : groupSize - LEAGUE_DEMOTE_COUNT + 1;

  return (
    <View style={styles.wrap}>
      <Card style={styles.tierCard}>
        <Text style={styles.tierEmoji}>{meta.emoji}</Text>
        <Text style={styles.tierTitle}>{meta.label} 리그</Text>
        <Text style={styles.tierSub}>상위 10명 승급 · 하위 5명 강등</Text>
      </Card>

      <Card style={styles.boardCard}>
        {board.map((entry) => {
          const isMe = entry.user_id === myUserId;
          const showDemoteLine = demoteLineRank > 0 && entry.rank === demoteLineRank;
          const showPromoteLine = promoteLineRank > 0 && entry.rank === promoteLineRank;
          return (
            <View key={`${entry.user_id}-${entry.rank}`}>
              {showDemoteLine ? (
                <Text style={[styles.line, styles.demoteLine]}>─ ▽ 강등선 ─</Text>
              ) : null}
              <View style={[styles.row, isMe && styles.rowMe]}>
                <Text style={styles.rank}>{entry.rank}</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {entry.display_name ?? 'Learner'}
                </Text>
                <Text style={styles.xp}>{entry.xp} XP</Text>
              </View>
              {showPromoteLine ? (
                <Text style={[styles.line, styles.promoteLine]}>─ ▲ 승급선 (상위 10) ─</Text>
              ) : null}
            </View>
          );
        })}
        {board.length === 0 ? (
          <Text style={styles.empty}>아직 이번 주 기록이 없어. 학습하면 순위에 올라가!</Text>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  tierCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  tierEmoji: { fontSize: 34 },
  tierTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: spacing.xs },
  tierSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 3, textAlign: 'center' },
  boardCard: { padding: spacing.sm, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 13,
  },
  rowMe: {
    backgroundColor: colors.primaryTint,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  rank: {
    width: 22,
    fontWeight: '800',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  name: { flex: 1, fontWeight: '600', fontSize: 14.5, color: colors.text },
  xp: {
    fontWeight: '700',
    color: colors.primaryDark,
    fontSize: 13.5,
    fontVariant: ['tabular-nums'],
  },
  line: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    paddingVertical: 6,
  },
  promoteLine: { color: colors.success },
  demoteLine: { color: colors.error },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: 13, paddingVertical: spacing.md },
});
