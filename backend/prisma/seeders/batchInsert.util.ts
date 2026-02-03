export async function batchInsert<T>(
    items: T[],
    batchSize: number,
    inserter: (item: T) => Promise<any>
) {
    const results: any[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        for (const item of batch) {
            results.push(await inserter(item));
        }
    }

    return results;
}