FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS deploy
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/generated ./generated
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma
RUN find dist -name "*.js" | head -20
EXPOSE 3001
CMD ["npm","run","dev"]
