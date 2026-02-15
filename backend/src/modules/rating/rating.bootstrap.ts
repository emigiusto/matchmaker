import { RatingService, defaultConfig } from './rating.service';
import { DeterministicRatingAlgorithm } from './algorithms/deterministic.algorithm';
import { EloRatingAlgorithm } from './algorithms/elo.algorithm';

export function configureRatingSystem(): void {
    const algo = process.env.RATING_ALGORITHM;
    if (algo === 'elo') {
        const rawK = process.env.RATING_K_FACTOR;

        if (rawK) {
            const parsedK = parseInt(rawK, 10);
            if (!Number.isFinite(parsedK) || parsedK <= 0) {
                throw new Error('Invalid RATING_K_FACTOR');
            }
            RatingService.setAlgorithm(new EloRatingAlgorithm(parsedK));
            console.log(`[RATING] Using EloRatingAlgorithm (kFactor=${parsedK})`);
        } else {
            RatingService.setAlgorithm(new EloRatingAlgorithm());
            console.log('[RATING] Using EloRatingAlgorithm (default K)');
        }
    } else {
        RatingService.setAlgorithm(new DeterministicRatingAlgorithm(defaultConfig));
        // eslint-disable-next-line no-console
        console.log('[RATING] Using DeterministicRatingAlgorithm');
    }
}
