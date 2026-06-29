export type ActivityStatus = 'draft' | 'published';

export interface ActivityImage {
  id: string;
  imageName: string;
  imageUrl: string;
  sortOrder: number;
  createdAt: string;
}

export interface Activity {
  id: string;
  title: string;
  theme: string;
  copywriting: string;
  status: ActivityStatus;
  sortOrder: number;
  coverImageName: string | null;
  coverImageUrl: string | null;
  images: ActivityImage[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivityInput {
  title: string;
  theme: string;
  copywriting: string;
  status: ActivityStatus;
}
