// matchmaking.controller.ts
// Read-only API controller for matchmaking suggestions.
// Business logic lives in matchmaking.service.ts.
// Enrichment (player profiles, stats, distance) lives in matchmaking.mapper.ts.
import { Request, Response, NextFunction } from 'express';
import * as MatchmakingService from './matchmaking.service';
import * as constants from './matchmaking.constants';
import { enrichCandidates } from './matchmaking.mapper';

export class MatchmakingController {
  /**
   * GET /matchmaking/all?userId=
   * Returns all matchmaking suggestions across both availability and profile modes,
   * merged into a single ranked feed and enriched with player details.
   *
   * Optional filters: topN, minScore, forceRefresh, maxDistanceKm, minLevel, maxLevel
   */
  static async getAllSuggestions(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, topN, minScore, forceRefresh, maxDistanceKm, minLevel, maxLevel } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid userId' });
      }
      const options: any = {};
      if (topN !== undefined) options.topN = Number(topN);
      if (minScore !== undefined) options.minScore = Number(minScore);
      if (forceRefresh !== undefined) options.forceRefresh = forceRefresh === 'true' || forceRefresh === '1';
      if (maxDistanceKm !== undefined) options.maxDistanceKm = Number(maxDistanceKm);
      if (minLevel !== undefined) options.minLevel = Number(minLevel);
      if (maxLevel !== undefined) options.maxLevel = Number(maxLevel);

      const candidates = await MatchmakingService.findAllMatchCandidatesForUser(userId, options);
      const enriched = await enrichCandidates(candidates, userId);
      return res.status(200).json(enriched);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /matchmaking?userId=&availabilityId=
   *
   * - If availabilityId is provided: returns ranked suggestions for that specific slot.
   * - If availabilityId is omitted: falls through to the full hybrid feed
   *   (same as /matchmaking/all), so the frontend can use a single endpoint.
   *
   * Both paths return SuggestedOpponentResponse[] enriched with player details.
   */
  static async getSuggestions(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, availabilityId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid userId' });
      }

      if (availabilityId && typeof availabilityId === 'string') {
        // Specific availability slot — return candidates for that slot only
        const result = await MatchmakingService.findMatchCandidates(userId, availabilityId);
        const enriched = await enrichCandidates(result.candidates, userId);
        return res.status(200).json(enriched);
      }

      // No availabilityId — return full hybrid feed
      const candidates = await MatchmakingService.findAllMatchCandidatesForUser(userId);
      const enriched = await enrichCandidates(candidates, userId);
      return res.status(200).json(enriched);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /matchmaking/test?userId=&availabilityId=
   * Renders matchmaking suggestions as an HTML table for visual inspection.
   * Requires availabilityId (debug tool for a specific slot).
   */
  static async getSuggestionsHtml(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, availabilityId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).send('<b>Missing or invalid userId</b>');
      }
      if (!availabilityId || typeof availabilityId !== 'string') {
        return res.status(400).send('<b>Missing or invalid availabilityId</b>');
      }
      const result = await MatchmakingService.findMatchCandidates(userId, availabilityId);
      let html = `<h2>Matchmaking Suggestions</h2>`;
      html += `<div style='margin-bottom:1em;padding:0.5em 1em;background:#f8f8f8;border:1px solid #ddd;'>`;
      html += `<b>How is the score calculated?</b><br/>`;
      html += `<ul style='margin:0.5em 0 0.5em 1.5em;'>`;
      html += `<li><b>Availability Overlap</b>: Minutes × WEIGHT_AVAILABILITY_OVERLAP (${constants.WEIGHT_AVAILABILITY_OVERLAP})</li>`;
      html += `<li><b>Social Proximity</b>: Friends (+50), Previous Opponent (+20), None (0)</li>`;
      html += `<li><b>Level Compatibility</b>: Close (+20), Playable (+5), Far (-5), Unknown (+10)</li>`;
      html += `<li><b>Location Proximity</b>: 0–20km linear from 15→0; 20km+: penalty</li>`;
      html += `<li><b>Surface Preference</b>: Match (+${constants.SCORE_SURFACE_MATCH}), Partial (+${constants.SCORE_SURFACE_PARTIAL})</li>`;
      html += `<li><b>Recent Activity</b>: Last 30d (+${constants.SCORE_RECENT_30_DAYS}), Last 90d (+${constants.SCORE_RECENT_90_DAYS})</li>`;
      html += `</ul>`;
      html += `<i>Final score = sum of all factors. Tune weights in <b>matchmaking.constants.ts</b>.</i>`;
      html += `</div>`;
      html += `<p><b>Availability:</b> ${result.availabilityId}</p>`;
      html += `<table border="1" cellpadding="6" style="border-collapse:collapse;">`;
      html += `<tr><th>Candidate User ID</th><th>Mode</th><th>Has Avail.</th><th>Total Score</th><th>Avail.</th><th>Social</th><th>Level</th><th>Location</th><th>Surface</th><th>Recent</th><th>Overlap Range</th><th>Reasons</th></tr>`;
      for (const c of result.candidates) {
        const fmt = (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : v ?? '');
        let overlapRange = '';
        if (c.overlapRange?.start && c.overlapRange?.end) {
          overlapRange = `${c.overlapRange.start.replace('T', ' ').substring(0, 16)} – ${c.overlapRange.end.replace('T', ' ').substring(0, 16)}`;
        }
        html += `<tr>`;
        html += `<td>${c.candidateUserId}</td>`;
        html += `<td>${c.matchMode}</td>`;
        html += `<td>${c.hasOpenAvailability ? '✓' : ''}</td>`;
        html += `<td><b>${fmt(c.score)}</b></td>`;
        html += `<td>${fmt(c.scoreBreakdown?.availability)}</td>`;
        html += `<td>${fmt(c.scoreBreakdown?.social)}</td>`;
        html += `<td>${fmt(c.scoreBreakdown?.level)}</td>`;
        html += `<td>${fmt(c.scoreBreakdown?.location)}</td>`;
        html += `<td>${fmt(c.scoreBreakdown?.surface)}</td>`;
        html += `<td>${fmt(c.scoreBreakdown?.recentActivity)}</td>`;
        html += `<td>${overlapRange}</td>`;
        html += `<td><ul>` + c.reasons.map(r => `<li>${r}</li>`).join('') + `</ul></td>`;
        html += `</tr>`;
      }
      html += `</table>`;
      res.send(html);
    } catch (error) {
      next(error);
    }
  }
}
