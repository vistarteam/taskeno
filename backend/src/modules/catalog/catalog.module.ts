import { Module } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import {
  CategoriesController,
  FilesController,
  MyServicesController,
  ProvidersController,
  ServicesController,
} from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [ServicesController, CategoriesController, MyServicesController, ProvidersController, FilesController],
  providers: [CatalogService, StorageService],
  exports: [CatalogService, StorageService],
})
export class CatalogModule {}
