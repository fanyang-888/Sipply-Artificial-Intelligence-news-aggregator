"""Map ORM models → API response schemas."""

from __future__ import annotations

from app.api.schemas import (
    ArticleInCluster,
    AudienceBlocks,
    ArchiveClusterRow,
    ClusterResponse,
    format_dt,
    freshness_label,
    localized,
    localized_bilingual,
)
from app.models.cluster import Cluster


def cluster_to_response(
    cluster: Cluster,
    related_cluster_ids: list[str] | None = None,
) -> ClusterResponse:
    tags: list[str] = cluster.tags or []
    themes: list[str] = []

    # Collect themes from cluster tags (first 3)
    if tags:
        themes = tags[:3]

    takeaways_raw: list[str] = cluster.takeaways or []

    # Audience blocks
    audience = AudienceBlocks(
        pm=localized_bilingual(cluster.why_it_matters_pm, getattr(cluster, "why_it_matters_pm_zh", None), "See cluster summary for context."),
        developer=localized_bilingual(cluster.why_it_matters_dev, getattr(cluster, "why_it_matters_dev_zh", None), "See cluster summary for context."),
        studentJobSeeker=localized_bilingual(cluster.why_it_matters_students, getattr(cluster, "why_it_matters_students_zh", None), "See cluster summary for context."),
    )

    takeaways_zh: list[str] = getattr(cluster, "takeaways_zh", None) or []
    bilingual_takeaways = []
    for i, t in enumerate(takeaways_raw):
        zh_t = takeaways_zh[i] if i < len(takeaways_zh) else None
        bilingual_takeaways.append(localized_bilingual(t, zh_t))
    while len(bilingual_takeaways) < 3:
        bilingual_takeaways.append(localized(""))

    article_ids = [str(a.id) for a in (cluster.articles or [])]

    articles_in_cluster = [
        ArticleInCluster(
            id=str(a.id),
            title=a.title or "",
            url=a.url or "",
            sourceName=a.organization_name,
            publishedAt=format_dt(a.published_at),
            excerpt=a.excerpt or a.short_summary,
        )
        for a in sorted(
            cluster.articles or [],
            key=lambda a: (a.signal_score or 0),
            reverse=True,
        )
    ]

    return ClusterResponse(
        id=str(cluster.id),
        clusterType=cluster.type or "event",
        title=localized_bilingual(cluster.representative_title, getattr(cluster, "representative_title_zh", None), "Untitled Story"),
        theme=cluster.type or "event",
        themes=themes,
        tags=tags,
        topicTag=cluster.topic_tag,
        storyStatus=cluster.status or "new",
        clusterScore=cluster.cluster_score,
        freshnessLabel=freshness_label(cluster.last_seen_at),
        firstSeenAt=format_dt(cluster.first_seen_at),
        lastSeenAt=format_dt(cluster.last_seen_at),
        summary=localized_bilingual(cluster.summary, getattr(cluster, "summary_zh", None), cluster.representative_title),
        takeaways=bilingual_takeaways,
        whyItMatters=localized_bilingual(cluster.why_it_matters, getattr(cluster, "why_it_matters_zh", None), ""),
        audience=audience,
        articleIds=article_ids,
        articles=articles_in_cluster,
        relatedClusterIds=related_cluster_ids or [],
        articleCount=cluster.article_count or 0,
        sourceCount=cluster.source_count or 0,
    )


def cluster_to_archive_row(cluster: Cluster) -> ArchiveClusterRow:
    source_names = sorted(
        {a.organization_name for a in (cluster.articles or []) if a.organization_name}
    )
    return ArchiveClusterRow(
        id=str(cluster.id),
        type="cluster",
        title=cluster.representative_title or "",
        title_zh=getattr(cluster, "representative_title_zh", None),
        summary=cluster.summary,
        summary_zh=getattr(cluster, "summary_zh", None),
        tags=cluster.tags or [],
        theme=cluster.type or "event",
        topicTag=cluster.topic_tag,
        storyStatus=cluster.status or "new",
        clusterScore=cluster.cluster_score,
        lastSeenAt=format_dt(cluster.last_seen_at),
        sourceCount=cluster.source_count or 0,
        sourceNames=source_names,
    )
