'use client';

// Force dynamic rendering to prevent prerender errors
export const dynamic = 'force-dynamic'

import { RouteGuard } from '@/components/auth/route-guard';
import { ManufacturingPermission } from '@/lib/auth-config';
import { PageContainer } from '@/components/ui/layout';
import UnitConfiguration from '@/components/configuration/UnitConfiguration';

export default function UnitsPage() {
  return (
    <RouteGuard 
      config={{
        requiresAuth: true,
        requiredPermissions: [ManufacturingPermission.SYSTEM_SETTINGS]
      }}
    >
      <PageContainer>
        <UnitConfiguration />
      </PageContainer>
    </RouteGuard>
  );
} 