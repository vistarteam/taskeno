import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Actor, CurrentUser, Public } from '../../common/decorators';
import type { ActorContext, AuthenticatedUser } from '../../common/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { TasksService } from './tasks.service';

const createTaskSchema = z.object({
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().min(10).max(5000),
    budgetRial: z.coerce.bigint().min(10_000n).max(100_000_000_000n),
    estimatedMinutes: z.coerce.number().int().min(1).max(240),
    categoryId: z.string().uuid().nullable().optional(),
    expiresInMinutes: z.coerce.number().int().min(15).max(10_080).default(1_440),
});

const taskListSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
});

type CreateTaskInput = z.infer<typeof createTaskSchema>;

@Controller('tasks')
export class TasksController {
    constructor(private readonly tasks: TasksService) {}

    @Public()
    @Get()
    list(@Query(new ZodValidationPipe(taskListSchema)) query: { limit: number }) {
        return this.tasks.listOpen(query.limit);
    }

    @Public()
    @Get(':id')
    detail(@Param('id') id: string) {
        return this.tasks.detail(id);
    }

    @Post()
    create(
        @CurrentUser() user: AuthenticatedUser,
        @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput,
        @Actor() actor: ActorContext,
    ) {
        return this.tasks.create(user.id, body, actor);
    }

    @Post(':id/take')
    @HttpCode(200)
    take(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id') id: string,
        @Actor() actor: ActorContext,
    ) {
        return this.tasks.take(id, user.id, actor);
    }

    @Post(':id/cancel')
    @HttpCode(200)
    cancel(
        @CurrentUser() user: AuthenticatedUser,
        @Param('id') id: string,
        @Actor() actor: ActorContext,
    ) {
        return this.tasks.cancel(id, user.id, actor);
    }
}