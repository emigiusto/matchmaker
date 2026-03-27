import type { PostMatchQuestionnaire } from "@/lib/types"

export type QuestionKey = keyof PostMatchQuestionnaire

// ─── Question pools (20 per category) ────────────────────────────────────────

/** Tennis singles: 5 shared + 15 singles-specific = 20 */
export const TENNIS_SINGLES_QUESTIONS: QuestionKey[] = [
  // Shared
  "matchPlayedOut",
  "generalSensation",
  "tacticAdjustment",
  "importantPoints",
  "physicalCondition",
  // Singles-specific
  "mainStrategy",
  "whatWorkedBest",
  "whatDidntWork",
  "pointBuilding",
  "serveStrategy",
  "targetedSide",
  "netApproach",
  "opponentStrength",
  "mainMistake",
  "returnStrategy",
  "mentalPerformance",
  "breakPointPerformance",
  "firstSetImpact",
  "courtPositioning",
  "decisionMaking",
]

/** Tennis doubles: 5 shared + 15 doubles-specific = 20 */
export const TENNIS_DOUBLES_QUESTIONS: QuestionKey[] = [
  // Shared
  "matchPlayedOut",
  "generalSensation",
  "tacticAdjustment",
  "importantPoints",
  "physicalCondition",
  // Doubles-specific
  "doublesMainStrategy",
  "teamCoordination",
  "netCoverage",
  "poachingFrequency",
  "formationUsed",
  "doublesOpponentStrength",
  "partnerCommunication",
  "doublesServeStrategy",
  "doublesReturnStrategy",
  "doublesTargetedOpponent",
  "netDuelOutcome",
  "doublesBreakPoints",
  "doublesWeakness",
  "serviceHoldRate",
  "doublesClutchPerformance",
]

/** Padel (always doubles): 5 shared + 15 padel-specific = 20 */
export const PADEL_QUESTIONS: QuestionKey[] = [
  // Shared
  "matchPlayedOut",
  "generalSensation",
  "tacticAdjustment",
  "importantPoints",
  "physicalCondition",
  // Padel-specific
  "padelMainStrategy",
  "padelWallUsage",
  "padelNetDomination",
  "padelPartnerSync",
  "padelShotVariety",
  "padelOpponentStrength",
  "padelLobDefense",
  "padelServeReturn",
  "padelBandeja",
  "padelVibora",
  "padelDefenseFromBack",
  "padelAttackOpportunity",
  "padelNetConquering",
  "padelWallVariety",
  "padelMentalGame",
]

// ─── Answer options per question key ─────────────────────────────────────────

export const QUESTION_OPTIONS: Record<QuestionKey, string[]> = {
  // ── Shared ──────────────────────────────────────────────────────────────────
  matchPlayedOut:          ["dominated", "balanced", "very_close", "struggled"],
  generalSensation:        ["confident", "nervous", "in_rhythm", "out_of_sync", "strong", "tired"],
  tacticAdjustment:        ["yes_successful", "yes_unsuccessful", "no_adjustment", "no_plan"],
  importantPoints:         ["very_strong", "solid", "inconsistent", "struggled"],
  physicalCondition:       ["excellent", "good", "adequate", "below_par", "injury_affected", "exhausted"],

  // ── Tennis singles ───────────────────────────────────────────────────────────
  mainStrategy:            ["baseline", "aggressive_forehand", "net_play", "defensive", "serve_focused", "mixed"],
  whatWorkedBest:          ["first_serve", "return", "forehand", "backhand", "movement", "mental"],
  whatDidntWork:           ["unforced_errors", "weak_second_serve", "positioning", "focus", "fatigue", "tactics"],
  pointBuilding:           ["long_rallies", "short_aggressive", "serve_first_shot", "counter_attacking", "waiting_errors", "mixed"],
  serveStrategy:           ["high_percentage", "aggressive", "targeted_weakness", "body_serves", "wide_serves", "no_strategy"],
  targetedSide:            ["forehand", "backhand", "mixed", "no_targeting"],
  netApproach:             ["frequently", "occasionally", "rarely", "never"],
  opponentStrength:        ["serve", "forehand", "backhand", "defense", "consistency", "mental", "endurance"],
  mainMistake:             ["forced_errors", "unforced_errors", "shot_selection", "predictable", "positioning", "second_serve"],
  returnStrategy:          ["aggressive_return", "deep_return", "short_angles", "body_return", "chip_charge", "no_clear_plan"],
  mentalPerformance:       ["focused_all_match", "lost_focus_briefly", "regained_focus", "struggled_to_focus", "mentally_drained"],
  breakPointPerformance:   ["converted_most", "converted_half", "converted_few", "none_converted", "not_applicable"],
  firstSetImpact:          ["won_and_controlled", "won_but_close", "lost_and_recovered", "lost_and_affected"],
  courtPositioning:        ["excellent", "good", "average", "poor"],
  decisionMaking:          ["excellent", "good", "average", "poor", "panicked_key_moments"],

  // ── Tennis doubles ───────────────────────────────────────────────────────────
  doublesMainStrategy:     ["both_at_net", "one_up_one_back", "aggressive_serving", "break_serve_fast", "wear_down", "mixed"],
  teamCoordination:        ["excellent", "good", "inconsistent", "poor", "communication_issues"],
  netCoverage:             ["dominated_net", "good_coverage", "average", "struggled", "rarely_approached"],
  poachingFrequency:       ["frequent_success", "frequent_failed", "occasional", "rarely", "never"],
  formationUsed:           ["standard", "australian", "i_formation", "both_back", "mixed"],
  doublesOpponentStrength: ["powerful_serve", "net_domination", "strong_returns", "solid_baseline", "great_coordination", "mental"],
  partnerCommunication:    ["excellent", "good", "average", "poor", "minimal"],
  doublesServeStrategy:    ["high_percentage", "targeted_body", "wide_serves", "t_serves", "mixed", "no_clear_plan"],
  doublesReturnStrategy:   ["aggressive_cross", "deep_cross", "lob_return", "at_net_player", "body_return", "no_clear_plan"],
  doublesTargetedOpponent: ["weaker_server", "weaker_returner", "net_player", "back_player", "no_targeting", "both_equally"],
  netDuelOutcome:          ["won_most", "won_half", "lost_most", "avoided_duels"],
  doublesBreakPoints:      ["converted_most", "converted_half", "converted_few", "none_converted", "not_applicable"],
  doublesWeakness:         ["serve_coordination", "net_coverage", "communication", "positioning", "second_serve", "fatigue"],
  serviceHoldRate:         ["held_all", "held_most", "mixed", "lost_most", "lost_all"],
  doublesClutchPerformance:["very_strong", "solid", "inconsistent", "struggled_pressure"],

  // ── Padel doubles ────────────────────────────────────────────────────────────
  padelMainStrategy:       ["control_net", "force_walls", "lob_heavy", "aggressive_smash", "consistent_baseline", "mixed"],
  padelWallUsage:          ["very_effective", "effective", "inconsistent", "poor", "avoided_walls"],
  padelNetDomination:      ["dominated_net", "good_presence", "contested", "struggled", "mainly_defended"],
  padelPartnerSync:        ["excellent_sync", "good_sync", "inconsistent", "poor_sync", "communication_issues"],
  padelShotVariety:        ["high_variety", "good_variety", "moderate", "limited", "predictable"],
  padelOpponentStrength:   ["wall_play", "net_control", "powerful_smash", "solid_lobbing", "serve_return", "mental_pressure"],
  padelLobDefense:         ["very_effective", "effective", "average", "struggled", "rarely_used"],
  padelServeReturn:        ["strong_serve", "aggressive_returns", "deep_returns", "defensive", "inconsistent", "no_clear_plan"],
  padelBandeja:            ["dominant_weapon", "effective", "inconsistent", "rarely_used", "needs_improvement"],
  padelVibora:             ["frequent_effective", "occasional_effective", "rarely_used", "needs_work", "not_attempted"],
  padelDefenseFromBack:    ["very_solid", "solid", "average", "weak", "collapsed_under_pressure"],
  padelAttackOpportunity:  ["created_many", "created_some", "few_opportunities", "couldnt_create"],
  padelNetConquering:      ["dominant", "effective", "contested", "struggled", "abandoned_net"],
  padelWallVariety:        ["high_variety", "standard_walls", "limited", "predictable", "no_wall_play"],
  padelMentalGame:         ["dominant_mentally", "solid", "equal", "lost_mental_battle", "inconsistent"],
}

/** Returns the question pool for a given match sport and format. */
export function getQuestionPool(sport: string | undefined, format: string | undefined): QuestionKey[] {
  if (sport === "padel") return PADEL_QUESTIONS
  if (format === "doubles") return TENNIS_DOUBLES_QUESTIONS
  return TENNIS_SINGLES_QUESTIONS
}
