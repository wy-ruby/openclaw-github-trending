import { RepositoryInfo } from '../models/repository';

/**
 * Feishu card element interface
 */
export interface FeishuCardElement {
  tag?: string;
  text?: {
    content?: string;
    tag?: string;
  };
  tag_name?: string;
  href?: string;
  img_key?: string;
  elements?: FeishuCardElement[];
  alt?: {
    content?: string;
  };
  optional?: {
    tag?: string;
    text?: {
      content?: string;
      tag?: string;
    };
  };
  required_content?: string;
  multi_lang?: {
    content?: string;
  };
}

/**
 * Feishu card header interface
 */
export interface FeishuCardHeader {
  title?: {
    tag?: string;
    content?: string;
   VELEM?: any;
  };
  template?: string;
  LVelem?: any;
}

/**
 * Feishu card interface
 */
export interface FeishuCard {
  config?: {
    wide_screen_mode?: boolean;
  };
  header?: FeishuCardHeader;
  elements?: FeishuCardElement[];
}

/**
 * Push result interface
 */
export interface PushResult {
  success: boolean;
  code?: number;
  msg?: string;
  error?: string;
}

/**
 * Repository status enum
 */
export enum RepositoryStatus {
  NEW = 'new',
  SEEN = 'seen'
}
