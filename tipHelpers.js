/* @tweakable The public project URL used to detect tip-based rank upgrades (e.g. https://websim.com/@creator/slug) */
export const RANK_TIP_PROJECT_URL = /* @tweakable */ "https://websim.com/@creator/example-project";

/* @tweakable Map of tip credit thresholds to rank names, descending order recommended */
export const TIP_CREDIT_RANK_MAP = /* @tweakable */ [
  { credits: 5000, rank: "Mythic" },
  { credits: 2500, rank: "Netherite" },
  { credits: 1000, rank: "Diamond" },
  { credits: 500, rank: "Gold" },
  { credits: 250, rank: "Lapis" }
];

import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify/dist/purify.es.min.js';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

/* Resolve a project id from a websim project URL or /p/{id} */
export async function resolveProjectIdFromUrl(projectUrl) {
  try {
    const u = new URL(projectUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'p' && parts[1]) return parts[1];
    if (parts[0] && parts[0].startsWith('@') && parts[1]) {
      const username = parts[0].slice(1);
      const slug = parts[1];
      const res = await fetch(`/api/v1/users/${encodeURIComponent(username)}/slugs/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error('Could not resolve slug');
      const json = await res.json();
      return json.project_id || json.id || null;
    }
  } catch (e) {
    console.warn('resolveProjectIdFromUrl failed', e);
  }
  return null;
}

/* Fetch all tip comments for a project (paginated) */
export async function fetchAllTipCommentsForProject(projectId) {
  const supporters = [];
  let url = `/api/v1/projects/${encodeURIComponent(projectId)}/comments?only_tips=true&first=100`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) break;
    const body = await res.json();
    const data = body.comments?.data || [];
    for (const item of data) {
      const c = item.comment;
      supporters.push({
        id: c.id,
        username: c.author?.username || c.author?.id,
        display_name: c.author?.display_name || c.author?.username,
        avatar_url: c.author?.avatar_url,
        credits_spent: c.card_data?.credits_spent || 0,
        created_at: c.created_at,
        raw_content: c.raw_content || '',
        html: (window.DOMPurify && window.marked) ? DOMPurify.sanitize(marked.parse(c.raw_content || '')) : (c.raw_content || '')
      });
    }
    const meta = body.comments?.meta || {};
    if (meta.has_next_page && meta.end_cursor) {
      const params = new URLSearchParams({ after: meta.end_cursor, only_tips: 'true', first: '100' });
      url = `/api/v1/projects/${encodeURIComponent(projectId)}/comments?${params.toString()}`;
    } else {
      url = null;
    }
  }
  return supporters;
}

/* @tweakable Whether to automatically apply rank when a tip is detected on the external project */
export const AUTO_APPLY_RANK_FROM_TIP = /* @tweakable */ true;

/* Given current user, check the external tips list and apply rank if found.
   Returns true if a rank was applied via tips, false otherwise. */
export async function checkTipsAndApplyRank() {
  if (!AUTO_APPLY_RANK_FROM_TIP) return null;
  try {
    const me = await window.websim.getCurrentUser();
    if (!me) return null;
    const projectId = await resolveProjectIdFromUrl(RANK_TIP_PROJECT_URL);
    if (!projectId) return null;
    const supporters = await fetchAllTipCommentsForProject(projectId);
    const myTips = supporters.filter(s => s.username && s.username.toLowerCase() === me.username.toLowerCase());
    if (myTips.length === 0) return null;
    myTips.sort((a,b) => (b.credits_spent - a.credits_spent) || (new Date(b.created_at) - new Date(a.created_at)));
    const best = myTips[0];
    // determine rank by mapping thresholds (highest matching)
    for (const mapping of TIP_CREDIT_RANK_MAP) {
      if ((best.credits_spent || 0) >= mapping.credits) {
        // lazy import getRankData and saveUserRank from app context via global functions (app exports not available),
        // we will attempt to call known global functions exposed on window (app sets them below)
        const rankName = mapping.rank;
        if (typeof window.getRankData === 'function' && typeof window.saveUserRank === 'function' && typeof window.ensureRoomInitialized === 'function') {
          const rankData = window.getRankData(rankName);
          if (!rankData) return null;
          await window.ensureRoomInitialized();
          await window.saveUserRank(rankData);
          // update presence if room is available
          if (window.room && window.room.updatePresence) {
            window.room.updatePresence({ rank: rankName, color: rankData.color, icon: rankData.icon });
          }
          return true;
        } else {
          console.warn('Required app functions not exposed to tipHelpers: getRankData/saveUserRank/ensureRoomInitialized');
          return null;
        }
      }
    }
    return null;
  } catch (e) {
    console.warn('checkTipsAndApplyRank failed', e);
    return null;
  }
}