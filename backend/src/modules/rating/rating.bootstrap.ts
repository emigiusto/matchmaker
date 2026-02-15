import { RatingService, defaultConfig } from './rating.service';
import { DeterministicRatingAlgorithm } from './algorithms/deterministic.algorithm';
import { EloRatingAlgorithm } from './algorithms/elo.algorithm';

export function configureRatingSystem(): void {
    const algo = process.env.RATING_ALGORITHM;
    if (algo === 'elo') {
        const rawK = process.env.RATING_K_FACTOR;
        const parsedK = rawK ? parseInt(rawK, 10) : 24;
        const kFactor = Number.isFinite(parsedK) && parsedK > 0 ? parsedK : 24;
        
        RatingService.setAlgorithm(new EloRatingAlgorithm(kFactor));
        // eslint-disable-next-line no-console
        console.log(`[RATING] Using EloRatingAlgorithm (kFactor=${kFactor})`);
    } else {
        RatingService.setAlgorithm(new DeterministicRatingAlgorithm(defaultConfig));
        // eslint-disable-next-line no-console
        console.log('[RATING] Using DeterministicRatingAlgorithm');
    }
}
