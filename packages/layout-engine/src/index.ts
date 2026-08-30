import type { PageSetup } from "@inpage/document-model";

export const DEFAULT_PAGE_WIDTH = 595.28;
export const DEFAULT_PAGE_HEIGHT = 841.89;
export const DEFAULT_PAGE_MARGIN = 50;

export interface PageContentBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PageBox {
  width: number;
  height: number;
  content: PageContentBox;
}

/** Resolve source page setup into the rectangle available for flowing content. */
export function resolvePageBox(pageSetup?: PageSetup): PageBox {
  const width = pageSetup?.widthPoints ?? DEFAULT_PAGE_WIDTH;
  const height = pageSetup?.heightPoints ?? DEFAULT_PAGE_HEIGHT;
  const margins = pageSetup?.margins ?? {
    leftPoints: DEFAULT_PAGE_MARGIN,
    topPoints: DEFAULT_PAGE_MARGIN,
    rightPoints: DEFAULT_PAGE_MARGIN,
    bottomPoints: DEFAULT_PAGE_MARGIN,
  };

  const contentWidth = width - margins.leftPoints - margins.rightPoints;
  const contentHeight = height - margins.topPoints - margins.bottomPoints;
  if (contentWidth <= 0 || contentHeight <= 0) {
    return resolvePageBox();
  }

  return {
    width,
    height,
    content: {
      left: margins.leftPoints,
      top: height - margins.topPoints,
      right: width - margins.rightPoints,
      bottom: margins.bottomPoints,
      width: contentWidth,
      height: contentHeight,
    },
  };
}
