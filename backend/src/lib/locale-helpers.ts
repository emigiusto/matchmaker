import { prisma } from '../prisma';

/**
 * Resolves the locale to use for WhatsApp group messages.
 *
 * - Singles: uses the `communicationLanguage` set on the host's Contact for the opponent.
 *   Falls back to the host's own locale if no contact record is found.
 * - Doubles: always uses the host's locale (no single "contact language" applies to a group).
 */
export async function resolveGroupMessageLocale(
  hostUserId: string,
  participantUserIds: string[],
  format: string,
): Promise<string> {
  const getHostLocale = async () => {
    const host = await prisma.user.findUnique({ where: { id: hostUserId }, select: { locale: true } });
    return host?.locale ?? 'es';
  };

  if (format === 'doubles') return getHostLocale();

  const opponentUserId = participantUserIds.find((id) => id !== hostUserId);
  if (!opponentUserId) return getHostLocale();

  const contact = await prisma.contact.findFirst({
    where: { ownerUserId: hostUserId, linkedUserId: opponentUserId },
    select: { communicationLanguage: true },
  });

  return contact?.communicationLanguage ?? await getHostLocale();
}
