import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  createServiceSchema,
  serviceQuerySchema,
  updateServiceSchema,
  type CreateServiceInput,
  type ServiceQuery,
  type UpdateServiceInput,
} from '@taskeno/contracts';
import { Actor, CurrentUser, Public } from '../../common/decorators';
import { AppError, ERROR_CODES } from '../../common/errors';
import { RateLimiter } from '../../common/rate-limit';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { ActorContext, AuthenticatedUser } from '../../common/types';
import { CatalogService } from './catalog.service';
import { StorageService } from '../storage/storage.service';

type MultipartRequest = FastifyRequest & {
  file: () => Promise<
    | {
        filename: string;
        mimetype: string;
        toBuffer: () => Promise<Buffer>;
      }
    | undefined
  >;
};

@Controller('categories')
export class CategoriesController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get()
  tree() {
    return this.catalog.categoryTree();
  }

  @Public()
  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.catalog.categoryBySlug(slug);
  }
}

@Controller('services')
export class ServicesController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly limiter: RateLimiter,
  ) {}

  @Public()
  @Get()
  list(@Query(new ZodValidationPipe(serviceQuerySchema)) query: ServiceQuery) {
    return this.catalog.search(query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createServiceSchema)) body: CreateServiceInput,
    @Actor() actor: ActorContext,
  ) {
    this.limiter.consume(`service:create:${user.id}`, 20, 24 * 60 * 60 * 1000);
    return this.catalog.createService(user.id, body, actor);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateServiceSchema)) body: UpdateServiceInput,
    @Actor() actor: ActorContext,
  ) {
    return this.catalog.updateService(user.id, id, body, actor);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Actor() actor: ActorContext) {
    return this.catalog.submitForReview(user.id, id, actor);
  }

  @Post(':id/pause')
  pause(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Actor() actor: ActorContext) {
    return this.catalog.pauseService(user.id, id, actor);
  }

  @Post(':id/images')
  async uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Req() request: MultipartRequest,
    @Actor() actor: ActorContext,
  ) {
    this.limiter.consume(`upload:user:${user.id}`, 60, 60 * 60 * 1000);

    const file = await request.file();
    if (!file) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, { message: 'فایلی ارسال نشده است.' });
    }
    const buffer = await file.toBuffer();

    return this.catalog.addServiceImage(
      user.id,
      id,
      { buffer, filename: file.filename, declaredMime: file.mimetype },
      actor,
    );
  }

  @Delete(':id/images/:imageId')
  removeImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.catalog.removeServiceImage(user.id, id, imageId, actor);
  }

  // Declared last so the literal routes above win the match.
  @Public()
  @Get(':slug')
  detail(@Param('slug') slug: string, @Req() request: FastifyRequest & { user?: AuthenticatedUser }) {
    return this.catalog.serviceBySlug(slug, { viewerId: request.user?.id ?? null });
  }
}

@Controller('me')
export class MyServicesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('services')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(serviceQuerySchema)) query: ServiceQuery,
  ) {
    return this.catalog.listProviderServices(user.id, query);
  }
}

@Controller('providers')
export class ProvidersController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get(':username')
  profile(@Param('username') username: string) {
    return this.catalog.publicProfile(username);
  }
}

/**
 * Serves stored images.
 *
 * Files attached to a service listing are public (they are part of the
 * catalogue). Anything else is only readable by its owner, which keeps delivery
 * attachments private. Storage keys are never exposed to clients.
 */
@Controller('files')
export class FilesController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get(':id')
  async download(
    @Param('id') id: string,
    @Req() request: FastifyRequest & { user?: AuthenticatedUser },
    @Res() reply: FastifyReply,
  ) {
    const file = await this.catalog.findFile(id);
    if (!file || file.deletedAt) throw new AppError(ERROR_CODES.NOT_FOUND, { status: 404 });

    const isPublic = await this.catalog.fileIsPubliclyVisible(id);
    if (!isPublic && request.user?.id !== file.ownerUserId) {
      throw new AppError(ERROR_CODES.FORBIDDEN_RESOURCE, { status: 403 });
    }

    const buffer = await this.storage.get(file.storageKey);
    void reply
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('content-type', file.mime)
      .send(buffer);
  }
}
