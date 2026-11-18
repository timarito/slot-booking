import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PROBLEM_CONTENT_TYPE, toProblemDetails } from './problem-details.js';

// @Catch() без аргументов ловит ВСЁ, что брошено при обработке запроса:
// наш AppException, HttpException из Nest и непредвиденные ошибки (баги, недоступная БД).
// Фильтр тонкий: маппинг живёт в toProblemDetails(), фильтр занимается только вводом-выводом HTTP.
// Подключён глобально в AppModule через APP_FILTER (почему не в main.ts — см. там).
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    // Только путь: query-строку не возвращаем клиенту в теле ошибки. (В лог запроса pino пишет
    // url целиком — это полезно для отладки фильтров и пагинации; поэтому секреты в query не кладём
    // никогда, токены идут только в заголовке и cookie.)
    const instance = request.originalUrl.split('?')[0] ?? request.originalUrl;
    const { status, body } = toProblemDetails(exception, instance);

    // 4xx — проблема клиента и ожидаемое поведение; 5xx — наша проблема, её надо расследовать.
    // Стек идёт только в лог и никогда — клиенту.
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${instance} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // type() обязательно до json(): Express ставит application/json, только если тип ещё не задан.
    response.status(status).type(PROBLEM_CONTENT_TYPE).json(body);
  }
}
