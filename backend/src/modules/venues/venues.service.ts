// venues.service.ts
// Service layer for venues (CRUD, simple filtering)

import { prisma } from '../../shared/prisma';
import { VenueDTO, CreateVenueInput, VenueFilters } from './venues.types';

export async function createVenue(data: CreateVenueInput): Promise<VenueDTO> {
  const venue = await prisma.venue.create({ data });
  return toVenueDTO(venue);
}

export async function listVenues(filters?: VenueFilters): Promise<VenueDTO[]> {
  const where: any = {};
  if (filters?.city) where.city = filters.city;
  if (filters?.surface) where.surface = filters.surface;
  const venues = await prisma.venue.findMany({ where, orderBy: { createdAt: 'desc' } });
  return venues.map(toVenueDTO);
}

export async function getVenueById(id: string): Promise<VenueDTO | null> {
  const venue = await prisma.venue.findUnique({ where: { id } });
  return venue ? toVenueDTO(venue) : null;
}

// Partial update (PATCH)
export async function updateVenue(id: string, data: Partial<CreateVenueInput>): Promise<VenueDTO | null> {
  const venue = await prisma.venue.update({
    where: { id },
    data,
  });
  return venue ? toVenueDTO(venue) : null;
}

// Full replace (PUT)
export async function replaceVenue(id: string, data: CreateVenueInput): Promise<VenueDTO | null> {
  const venue = await prisma.venue.update({
    where: { id },
    data,
  });
  return venue ? toVenueDTO(venue) : null;
}

// Delete (DELETE)
export async function deleteVenue(id: string): Promise<boolean> {
  try {
    await prisma.venue.delete({ where: { id } });
    return true;
  } catch (err) {
    // Not found or already deleted
    return false;
  }
}

function toVenueDTO(venue: any): VenueDTO {
  return {
    id: venue.id,
    name: venue.name,
    city: venue.city,
    address: venue.address,
    indoor: venue.indoor,
    surface: venue.surface,
    createdAt: venue.createdAt.toISOString(),
  };
}
