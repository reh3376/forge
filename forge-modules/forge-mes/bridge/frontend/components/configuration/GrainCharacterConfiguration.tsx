'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Edit, Plus, Search, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery, useMutation } from '@apollo/client';
import { apolloClient } from '@/lib/api/unified-graphql-client';
import {
  GET_ITEM_GROUPS_FOR_LINKING,
  LINK_ITEM_GROUPS_TO_GRAIN_CHARACTER,
} from '@/lib/api/graphql-queries';
import {
  useAllGrainCharacters,
  useGrainCharacterMutations,
  useGrainCharacterUsage,
  GrainCharacter,
} from '@/lib/hooks/use-grain-characters';

interface ItemGroup {
  id: string;
  name: string;
  grainCharacterId: string | null;
}

interface FormData {
  abbreviation: string;
  name: string;
  varietyCode: string;
  description: string;
  active: boolean;
}

const initialFormData: FormData = {
  abbreviation: '',
  name: '',
  varietyCode: '',
  description: '',
  active: true,
};

export default function GrainCharacterConfiguration() {
  const { grainCharacters, loading, error, refetch } = useAllGrainCharacters();
  const { createGrainCharacter, updateGrainCharacter, deleteGrainCharacter, setGrainCharacterActive, loading: mutationLoading } = useGrainCharacterMutations();

  // ItemGroup queries and mutations
  const { data: itemGroupsData, refetch: refetchItemGroups } = useQuery(GET_ITEM_GROUPS_FOR_LINKING, {
    client: apolloClient as any,
  });
  const [linkItemGroupsMutation] = useMutation(LINK_ITEM_GROUPS_TO_GRAIN_CHARACTER, {
    client: apolloClient as any,
  });

  const itemGroups: ItemGroup[] = itemGroupsData?.itemGroups || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingGrain, setEditingGrain] = useState<GrainCharacter | null>(null);
  const [deletingGrain, setDeletingGrain] = useState<GrainCharacter | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedItemGroups, setSelectedItemGroups] = useState<string[]>([]);

  // Get usage info for the grain being deleted
  const { usage } = useGrainCharacterUsage(deletingGrain?.id || null);

  // Filter grains by search term
  const filteredGrains = grainCharacters.filter((grain) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      grain.name.toLowerCase().includes(searchLower) ||
      grain.abbreviation.toLowerCase().includes(searchLower) ||
      (grain.varietyCode && grain.varietyCode.toLowerCase().includes(searchLower))
    );
  });

  // Open dialog for creating new grain
  const handleCreate = () => {
    setEditingGrain(null);
    setFormData(initialFormData);
    setSelectedItemGroups([]);
    setFormError(null);
    setIsDialogOpen(true);
  };

  // Open dialog for editing existing grain
  const handleEdit = (grain: GrainCharacter) => {
    setEditingGrain(grain);
    setFormData({
      abbreviation: grain.abbreviation,
      name: grain.name,
      varietyCode: grain.varietyCode || '',
      description: grain.description || '',
      active: grain.active,
    });
    // Set currently linked item groups
    const linkedGroups = itemGroups
      .filter(ig => ig.grainCharacterId === grain.id)
      .map(ig => ig.id);
    setSelectedItemGroups(linkedGroups);
    setFormError(null);
    setIsDialogOpen(true);
  };

  // Open delete confirmation dialog
  const handleDeleteClick = (grain: GrainCharacter) => {
    setDeletingGrain(grain);
    setIsDeleteDialogOpen(true);
  };

  // Handle form submission
  const handleSubmit = async () => {
    setFormError(null);

    // Basic validation
    if (!formData.abbreviation || !formData.name) {
      setFormError('Abbreviation and name are required');
      return;
    }

    try {
      let grainCharId: string;

      if (editingGrain) {
        await updateGrainCharacter(editingGrain.id, {
          abbreviation: formData.abbreviation,
          name: formData.name,
          varietyCode: formData.varietyCode || null,
          description: formData.description || null,
          active: formData.active,
        });
        grainCharId = editingGrain.id;

        // Update item group links
        await linkItemGroupsMutation({
          variables: { grainCharacterId: grainCharId, itemGroupIds: selectedItemGroups },
        });

        setSuccessMessage('Grain character updated successfully');
      } else {
        const result = await createGrainCharacter({
          abbreviation: formData.abbreviation,
          name: formData.name,
          varietyCode: formData.varietyCode || null,
          description: formData.description || null,
          active: formData.active,
        });
        grainCharId = result?.id;

        // Link selected item groups to the new grain character
        if (grainCharId && selectedItemGroups.length > 0) {
          await linkItemGroupsMutation({
            variables: { grainCharacterId: grainCharId, itemGroupIds: selectedItemGroups },
          });
        }

        setSuccessMessage('Grain character created successfully');
      }

      setIsDialogOpen(false);
      refetch();
      refetchItemGroups();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setFormError(message);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deletingGrain) return;

    try {
      await deleteGrainCharacter(deletingGrain.id);
      setSuccessMessage('Grain character deleted successfully');
      setIsDeleteDialogOpen(false);
      setDeletingGrain(null);
      refetch();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setFormError(message);
      setTimeout(() => setFormError(null), 5000);
    }
  };

  // Handle active toggle
  const handleToggleActive = async (grain: GrainCharacter) => {
    try {
      await setGrainCharacterActive(grain.id, !grain.active);
      setSuccessMessage(`Grain character ${grain.active ? 'deactivated' : 'activated'}`);
      refetch();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setFormError(message);
      setTimeout(() => setFormError(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading grain characters...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Error loading grain characters: {error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Grain Characters</h1>
          <p className="text-muted-foreground">
            Manage grain character abbreviations used in mashbill recipes
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Grain Character
        </Button>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <Alert className="bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
        </Alert>
      )}
      {formError && !isDialogOpen && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search grain characters..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Grain Characters List */}
      <div className="grid gap-4">
        {filteredGrains.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {searchTerm ? 'No grain characters match your search' : 'No grain characters configured'}
            </CardContent>
          </Card>
        ) : (
          filteredGrains.map((grain) => (
            <Card key={grain.id} className={!grain.active ? 'opacity-60' : ''}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 font-mono font-bold text-primary">
                    {grain.abbreviation}
                    {grain.varietyCode && (
                      <span className="text-xs">{grain.varietyCode}</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{grain.name}</span>
                      {grain.itemGroups && grain.itemGroups.length > 0 && (
                        grain.itemGroups.map((group) => (
                          <Badge key={group.id} variant="outline" className="text-xs">
                            {group.name}
                          </Badge>
                        ))
                      )}
                      {!grain.active && (
                        <Badge variant="secondary" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    {grain.description && (
                      <p className="text-sm text-muted-foreground">{grain.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={grain.active}
                    onCheckedChange={() => handleToggleActive(grain)}
                    disabled={mutationLoading}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(grain)}
                    disabled={mutationLoading}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteClick(grain)}
                    disabled={mutationLoading}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingGrain ? 'Edit Grain Character' : 'Add Grain Character'}
            </DialogTitle>
            <DialogDescription>
              {editingGrain
                ? 'Update the grain character details below'
                : 'Create a new grain character for use in mashbill recipes'}
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="abbreviation">Abbreviation *</Label>
                <Input
                  id="abbreviation"
                  value={formData.abbreviation}
                  onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value.toUpperCase() })}
                  placeholder="C, R, W..."
                  maxLength={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="varietyCode">Variety Code</Label>
                <Input
                  id="varietyCode"
                  value={formData.varietyCode}
                  onChange={(e) => setFormData({ ...formData, varietyCode: e.target.value })}
                  placeholder="1, 2, 3..."
                  maxLength={5}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Corn, Rye, Malted Rye..."
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(checked: boolean) => setFormData({ ...formData, active: checked })}
              />
              <Label htmlFor="active">Active</Label>
            </div>

            {/* Item Group linking */}
            <div className="grid gap-2">
              <Label>Linked Item Groups</Label>
              {itemGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No item groups available</p>
              ) : (
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                  {itemGroups.map((ig) => {
                    const isLinkedToOther = ig.grainCharacterId && ig.grainCharacterId !== editingGrain?.id;
                    return (
                      <div key={ig.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`ig-${ig.id}`}
                          checked={selectedItemGroups.includes(ig.id)}
                          onCheckedChange={(checked: boolean | 'indeterminate') => {
                            if (checked === true) {
                              setSelectedItemGroups([...selectedItemGroups, ig.id]);
                            } else {
                              setSelectedItemGroups(selectedItemGroups.filter(id => id !== ig.id));
                            }
                          }}
                          disabled={!!isLinkedToOther}
                        />
                        <Label
                          htmlFor={`ig-${ig.id}`}
                          className={`text-sm ${isLinkedToOther ? 'text-muted-foreground' : ''}`}
                        >
                          {ig.name}
                          {isLinkedToOther && ' (linked to another)'}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={mutationLoading}>
              {editingGrain ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Grain Character</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingGrain?.name}&quot;?
            </DialogDescription>
          </DialogHeader>

          {usage && !usage.canDelete && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This grain character cannot be deleted because it is used in {usage.recipeCount} recipe(s).
                Consider deactivating it instead.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={mutationLoading || (usage !== null && !usage.canDelete)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
