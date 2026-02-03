// matchmaking.controller.ts
// Read-only API controller for matchmaking suggestions.
//
// Expected frontend usage:
//   - GET /matchmaking?userId=...&availabilityId=...
//     → Returns ranked, explainable suggestions for who to play with for a given user and availability.
//
// No auth logic, no side effects, no caching (yet).

import { Request, Response, NextFunction } from 'express';
import * as MatchmakingService from './matchmaking.service';

export class MatchmakingController {
  /**
   * GET /matchmaking?userId=&availabilityId=
   * Returns ranked, explainable suggestions for a user and availability.
   */
  static async getSuggestions(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, availabilityId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid userId' });
      }
      if (!availabilityId || typeof availabilityId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid availabilityId' });
      }
      const result = await MatchmakingService.findMatchCandidates(userId, availabilityId);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /matchmaking/test?userId=&availabilityId=
   * Renders matchmaking suggestions as an HTML table for visual inspection.
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
      // Score composition explanation
      let html = `<h2>Matchmaking Suggestions</h2>`;
      html += `<div style='margin-bottom:1em;padding:0.5em 1em;background:#f8f8f8;border:1px solid #ddd;'>`;
      html += `<b>How is the score calculated?</b><br/>`;
      html += `<ul style='margin:0.5em 0 0.5em 1.5em;'>`;
      const constants = require('./matchmaking.constants');
      html += `<li><b>Availability Overlap</b>: Minutes of overlap × <b>WEIGHT_AVAILABILITY_OVERLAP</b> (${constants.WEIGHT_AVAILABILITY_OVERLAP})</li>`;
      html += `<li><b>Social Proximity</b>: Friends (+50), Previous Opponent (+20), None (0) × <b>WEIGHT_SOCIAL_PROXIMITY</b> (${constants.WEIGHT_SOCIAL_PROXIMITY})</li>`;
      html += `<li><b>Level Compatibility</b>: Close (+20), Playable (+5), Far (-5), Unknown (+10) × <b>WEIGHT_LEVEL_COMPATIBILITY</b> (${constants.WEIGHT_LEVEL_COMPATIBILITY})</li>`;
      html += `<li><b>Location Proximity</b>: 0–20km: Linear from 15→0 × <b>WEIGHT_LOCATION_PROXIMITY</b> (${constants.WEIGHT_LOCATION_PROXIMITY}); 20km+: 0</li>`;
      html += `</ul>`;
      html += `<i>Final score = sum of all factors above. <br/>You can tune weights in <b>matchmaking.constants.ts</b>.</i>`;
      html += `</div>`;
      html += `<p><b>Availability:</b> ${result.availabilityId}</p>`;
      html += `<table border="1" cellpadding="6" style="border-collapse:collapse;">`;
      html += `<tr><th>Candidate User ID</th><th>Candidate Player ID</th><th>Total Score</th><th>Avail.</th><th>Social</th><th>Level</th><th>Location</th><th>Surface</th><th>Overlap Range</th><th>Requester Avail ID</th><th>Candidate Avail ID</th><th>Reasons</th></tr>`;
      for (const c of result.candidates) {
        // Round scores to 3 decimals
        const fmt = (v: unknown) => (typeof v === 'number' ? v.toFixed(3) : v ?? '');
        // Use overlapRange from the service if available (as two ISO strings)
        let overlapRange = '';
        if (c.overlapRange && c.overlapRange.start && c.overlapRange.end) {
          overlapRange = `${c.overlapRange.start.replace('T', ' ').substring(0, 16)} - ${c.overlapRange.end.replace('T', ' ').substring(0, 16)}`;
        }
        html += `<tr>`;
        html += `<td>${c.candidateUserId}</td>`;
        html += `<td>${c.candidatePlayerId ?? ''}</td>`;
        html += `<td>${fmt(c.score)}</td>`;
        html += `<td>${fmt(c.scoreBreakdown?.availability)}</td>`;
        html += `<td>${fmt(c.scoreBreakdown?.social)}</td>`;
        html += `<td>${fmt(c.scoreBreakdown?.level)}</td>`;
        html += `<td>${fmt(c.scoreBreakdown?.location)}</td>`;
        html += `<td>${fmt(c.scoreBreakdown?.surface)}</td>`;
        html += `<td>${overlapRange}</td>`;
        html += `<td>${c.requesterAvailabilityId ?? ''}</td>`;
        html += `<td>${c.candidateAvailabilityId ?? ''}</td>`;
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