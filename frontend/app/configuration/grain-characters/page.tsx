'use client';

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { RouteGuard } from '@/components/auth/route-guard';
import { ManufacturingPermission } from '@/lib/auth-config';
import { PageContainer } from '@/components/ui/layout';
import GrainCharacterConfiguration from '@/components/configuration/GrainCharacterConfiguration';

export default function GrainCharactersPage() {
  return (
    <RouteGuard
      config={{
        requiresAuth: true,
        requiredPermissions: [ManufacturingPermission.SYSTEM_SETTINGS]
      }}
    >
      <PageContainer>
        <GrainCharacterConfiguration />
      </PageContainer>
    </RouteGuard>
  );
}
