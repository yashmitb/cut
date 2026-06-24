// All icons come from lucide-react, re-exported under the names the app uses.
import * as React from "react";
import {
  Home,
  ChartColumnBig,
  User,
  Camera,
  Plus,
  Trash2,
  Send,
  Sparkles,
  Droplet,
  TriangleAlert,
  Check,
  ChevronLeft as LChevronLeft,
  ChevronRight as LChevronRight,
  Pencil,
  Image as LImage,
  Scale,
  Sunrise,
  Salad,
  UtensilsCrossed,
  Apple,
  Flame,
  Sprout,
  Layers,
  ChevronDown,
  Search,
  BookOpen,
  MessageCircleQuestion,
  Star,
  Copy,
  Bell,
  Download,
  PartyPopper,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { MealType } from "@/lib/types";

export const HomeIcon = Home;
export const ChartIcon = ChartColumnBig;
export const UserIcon = User;
export const CameraIcon = Camera;
export const PlusIcon = Plus;
export const TrashIcon = Trash2;
export const SendIcon = Send;
export const SparkIcon = Sparkles;
export const WaterIcon = Droplet;
export const WarnIcon = TriangleAlert;
export const CheckIcon = Check;
export const ChevronLeft = LChevronLeft;
export const ChevronRight = LChevronRight;
export const PencilIcon = Pencil;
export const ImageIcon = LImage;
export const ScaleIcon = Scale;
export { Flame, Sprout, Layers, ChevronDown, Search, BookOpen, Bell, Target };
export const AskIcon = MessageCircleQuestion;
export const StarIcon = Star;
export const StarFilledIcon = (props: React.ComponentProps<typeof Star>) => <Star {...props} fill="currentColor" />;
export const CopyIcon = Copy;
export const DownloadIcon = Download;
export const CelebrateIcon = PartyPopper;

export const MEAL_ICONS: Record<MealType, LucideIcon> = {
  breakfast: Sunrise,
  lunch: Salad,
  dinner: UtensilsCrossed,
  snack: Apple,
};
