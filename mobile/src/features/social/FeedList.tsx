import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SkeletonLines, messageFor } from '@/screens/queryState';
import { useTheme } from '@/theme';
import { Button, ErrorState, Text } from '@/ui';
import type { SocialFeedDTO } from '@shared/application/social';

import { PostCard } from './PostCard';

/** A paginated, chronological list of posts with skeleton loading and a real error state. */
export function FeedList({
  query,
  header,
  empty,
}: {
  query: UseInfiniteQueryResult<InfiniteData<SocialFeedDTO>>;
  header?: ReactElement | null;
  empty: ReactElement;
}) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: space[10] + insets.bottom, flexGrow: 1 }}
      contentInsetAdjustmentBehavior="automatic"
      data={items}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <PostCard post={item} />}
      ListHeaderComponent={header ?? undefined}
      onEndReachedThreshold={0.6}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      ListEmptyComponent={
        query.isPending ? (
          <View style={{ gap: space[6], paddingTop: space[4] }}>
            {[0, 1, 2].map((i) => (
              <SkeletonLines key={i} label="Loading posts" widths={['45%', '90%', '70%']} />
            ))}
          </View>
        ) : query.isError ? (
          <ErrorState message={messageFor(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          empty
        )
      }
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <View style={{ paddingVertical: space[4] }}>
            <SkeletonLines label="Loading more" widths={['45%', '85%']} />
          </View>
        ) : query.isError && items.length > 0 ? (
          <View style={{ paddingVertical: space[4], gap: space[2] }}>
            <Text tone="danger">{messageFor(query.error)}</Text>
            <Button title="Try again" variant="secondary" size="compact" onPress={() => void query.fetchNextPage()} />
          </View>
        ) : undefined
      }
    />
  );
}
