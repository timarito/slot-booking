import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PROBLEM_CONTENT_TYPE, toProblemDetails } from './problem-details.js';

// @Catch() with no arguments catches EVERYTHING thrown while handling a request:
// our AppException, Nest's HttpExceptions and unexpected errors (bugs, DB down).
// The filter stays thin: mapping lives in toProblemDetails(), the filter only does HTTP I/O.
// Registered globally in AppModule via APP_FILTER (see there for why not in main.ts).
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    // Path only: the query string may carry data we don't want echoed back or logged.
    const instance = request.originalUrl.split('?')[0] ?? request.originalUrl;
    const { status, body } = toProblemDetails(exception, instance);

    // 4xx are the client's problem and expected; 5xx are ours and need investigating.
    // The stack goes to the log only, never to the client.
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${instance} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // type() must come before json(): Express only sets application/json if no type is set.
    response.status(status).type(PROBLEM_CONTENT_TYPE).json(body);
  }
}
