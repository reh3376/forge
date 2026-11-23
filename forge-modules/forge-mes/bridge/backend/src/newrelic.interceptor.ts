import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable, throwError } from "rxjs";
import { tap, catchError } from "rxjs/operators";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const util = require("util");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const newrelic = require("newrelic");

@Injectable()
export class NewrelicInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return newrelic.startWebTransaction(context.getHandler().name, function () {
      const transaction = newrelic.getTransaction();
      return next.handle().pipe(
        tap(() => {
          transaction.end();
        }),
        catchError((err) => {
          if (!err.stack) {
            err.stack = ""; // Ensure stack is defined
          }
          transaction.end();
          return throwError(err);
        })
      );
    });
  }
}
