"use client";

import { RouteGuard } from "@/components/auth/route-guard";
import { ManufacturingPermission } from "@/lib/auth-config";
import { PageContainer } from "@/components/ui/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Grid3X3,
  List,
  Star,
  Copy,
  Share2,
  Eye,
  Clock,
  Users,
  Filter,
} from "lucide-react";
import Link from "next/link";
import { useState, useMemo } from "react";

// Mock data for templates (in real app, this would come from API)
const mockTemplates = [
  {
    id: "tpl-001",
    name: "Standard Bourbon Template",
    description:
      "Classic bourbon recipe with 75% corn, 21% rye, 4% malted barley",
    whiskeyType: "Bourbon",
    complexity: "intermediate",
    mashBillPattern: "75-21-00-04",
    customerName: "JBM Liquid Assets",
    customerId: "JBM",
    isPublic: true,
    isFavorite: false,
    useCount: 15,
    averageRating: 4.2,
    totalRatings: 8,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-03-20"),
    lastUsed: new Date("2024-05-15"),
    tags: [
      { id: "tag-1", name: "High Corn", category: "flavor_profile" },
      { id: "tag-2", name: "Traditional", category: "production_method" },
    ],
  },
  {
    id: "tpl-002",
    name: "Wheated Bourbon Premium",
    description:
      "Smooth wheated bourbon with 68% corn, 20% wheat, 12% malted barley",
    whiskeyType: "WheatBourbon",
    complexity: "advanced",
    mashBillPattern: "68-00-20-12",
    customerName: "Bernstein-Gruppe AG",
    customerId: "BHK",
    isPublic: false,
    isFavorite: true,
    useCount: 8,
    averageRating: 4.7,
    totalRatings: 5,
    createdAt: new Date("2024-02-10"),
    updatedAt: new Date("2024-04-15"),
    lastUsed: new Date("2024-05-20"),
    tags: [
      { id: "tag-3", name: "Wheated", category: "flavor_profile" },
      { id: "tag-4", name: "Premium", category: "customer_specific" },
    ],
  },
  {
    id: "tpl-003",
    name: "High Rye Spice Blend",
    description:
      "Bold high-rye bourbon with 60% corn, 35% rye, 5% malted barley",
    whiskeyType: "RyeBourbon",
    complexity: "expert",
    mashBillPattern: "60-35-00-05",
    customerName: "Ultra Pure LLC",
    customerId: "UPL",
    isPublic: true,
    isFavorite: false,
    useCount: 12,
    averageRating: 4.5,
    totalRatings: 10,
    createdAt: new Date("2024-03-05"),
    updatedAt: new Date("2024-05-10"),
    lastUsed: new Date("2024-05-22"),
    tags: [
      { id: "tag-5", name: "High Rye", category: "flavor_profile" },
      { id: "tag-6", name: "Spicy", category: "flavor_profile" },
    ],
  },
];

type ViewMode = "grid" | "list";

export default function TemplateLibraryPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);

  // Filter templates based on search and filters
  const filteredTemplates = useMemo(() => {
    return mockTemplates.filter((template) => {
      const matchesSearch =
        !searchQuery ||
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        template.whiskeyType
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        template.customerName
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase());

      return matchesSearch;
    });
  }, [searchQuery]);

  const handleTemplateAction = (action: string, templateId: string) => {
    console.log(`${action} template:`, templateId);
    // TODO: Implement actual actions
  };

  return (
    <RouteGuard
      config={{
        requiresAuth: true,
        requiredPermissions: [ManufacturingPermission.VIEW_RECIPES],
        redirectTo: "/",
      }}
    >
      <PageContainer>
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Recipe Template Library</h1>
              <p className="text-muted-foreground">
                Browse, search, and manage recipe templates for whiskey
                production
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/recipe-management/create">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Recipe
                </Button>
              </Link>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search templates by name, description, whiskey type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="rounded-r-none"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Results Summary */}
          <div className="text-sm text-muted-foreground">
            {filteredTemplates.length} template
            {filteredTemplates.length !== 1 ? "s" : ""} found
          </div>

          {/* Templates Grid/List */}
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onAction={handleTemplateAction}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTemplates.map((template) => (
                <TemplateListItem
                  key={template.id}
                  template={template}
                  onAction={handleTemplateAction}
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {filteredTemplates.length === 0 && (
            <div className="text-center py-12">
              <div className="text-muted-foreground">
                <p className="text-lg mb-2">No templates found</p>
                <p>
                  Try adjusting your search criteria or create a new template
                </p>
              </div>
            </div>
          )}
        </div>
      </PageContainer>
    </RouteGuard>
  );
}

// Template Card Component for Grid View
function TemplateCard({
  template,
  onAction,
}: {
  template: any;
  onAction: (action: string, templateId: string) => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg line-clamp-1">
              {template.name}
            </CardTitle>
            <CardDescription className="line-clamp-2 mt-1">
              {template.description}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 ml-2">
            {template.isFavorite && (
              <Star className="h-4 w-4 text-yellow-500 fill-current" />
            )}
            {template.isPublic ? (
              <Users className="h-4 w-4 text-blue-500" />
            ) : (
              <div className="h-4 w-4" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Template Info */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Whiskey Type:</span>
            <span className="font-medium">{template.whiskeyType}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Mash Bill:</span>
            <span className="font-mono text-xs">
              {template.mashBillPattern}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Customer:</span>
            <span className="font-medium">{template.customerName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Complexity:</span>
            <Badge variant="outline" className="text-xs">
              {template.complexity}
            </Badge>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {template.tags.slice(0, 3).map((tag: any) => (
            <Badge key={tag.id} variant="secondary" className="text-xs">
              {tag.name}
            </Badge>
          ))}
          {template.tags.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{template.tags.length - 3}
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3" />
            {template.averageRating?.toFixed(1)} ({template.totalRatings})
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Used {template.useCount} times
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => onAction("view", template.id)}
          >
            <Eye className="h-3 w-3 mr-1" />
            View
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction("duplicate", template.id)}
          >
            <Copy className="h-3 w-3 mr-1" />
            Use
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction("share", template.id)}
          >
            <Share2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Template List Item Component for List View
function TemplateListItem({
  template,
  onAction,
}: {
  template: any;
  onAction: (action: string, templateId: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
            {/* Name and Description */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{template.name}</h3>
                {template.isFavorite && (
                  <Star className="h-4 w-4 text-yellow-500 fill-current" />
                )}
                {template.isPublic ? (
                  <Users className="h-4 w-4 text-blue-500" />
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-1">
                {template.description}
              </p>
            </div>

            {/* Whiskey Type */}
            <div className="text-sm">
              <span className="font-medium">{template.whiskeyType}</span>
            </div>

            {/* Mash Bill */}
            <div className="text-sm font-mono">{template.mashBillPattern}</div>

            {/* Customer */}
            <div className="text-sm">{template.customerName}</div>

            {/* Stats */}
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3" />
                {template.averageRating?.toFixed(1)}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {template.useCount} uses
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 ml-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction("view", template.id)}
            >
              <Eye className="h-4 w-4 mr-1" />
              View
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction("duplicate", template.id)}
            >
              <Copy className="h-4 w-4 mr-1" />
              Use
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction("share", template.id)}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
