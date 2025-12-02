package org.example; //пр-во имен для классов
import com.fastcgi.FCGIInterface; //fast cgi рантайм
import java.io.UnsupportedEncodingException; //база: кодировки и тп
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.net.URLDecoder; //для разбора query_string и дат/времени
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList; //коллекции и вспомогательные типы
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

public class Main {
    private static final List<HistoryEntry> HISTORY = new ArrayList<>(); //глобальная история запросов (живая пока жив процесс fast cgi)
    private static final int HISTORY_LIMIT = 100; //огр на длину истории (обрезаем старые записи)
    private static final MathContext MC = new MathContext(34, RoundingMode.HALF_UP); //вычисления (34 значащих цифр, half_up округление)
    private static final BigDecimal MIN_Y = new BigDecimal("-5"); //константы диапазона Y по значению
    private static final BigDecimal MAX_Y = new BigDecimal("5");
    private static final BigDecimal TWO = new BigDecimal("2"); //константы 2 и 4 для формул
    private static final BigDecimal FOUR = new BigDecimal("4");
    private static final BigDecimal NANOS_IN_MILLI = new BigDecimal("1000000"); //конвертер наносекунд в миллисекунды для elapsed_ms
    private static final BigDecimal[] ALLOWED_R = { //допустимые значения R (BigDecimal чтоб различать 1.5 и тд без потерь)
            new BigDecimal("1"),
            new BigDecimal("1.5"),
            new BigDecimal("2"),
            new BigDecimal("2.5"),
            new BigDecimal("3")
    };

    public static void main(String[] args) { //fastCGI процесс
        FCGIInterface fastcgi = new FCGIInterface(); //инициализация интерфейса fastcgi
        while (fastcgi.FCGIaccept() >= 0) { //основной цикл FastCGIaccept() - принять очередной запрос
            handleRequest(fastcgi); //обработка одного запроса
        }
    }
    // обработчик запроса FastCGI
    private static void handleRequest(FCGIInterface fastcgi) {
        Properties env = fastcgi.request != null ? fastcgi.request.params : null; //cgi-переменные окружения (PATH_INFO, REQUEST_URI, QUERY_STRING, SCRIPT_NAME и тд)
        if (env == null) {
            env = new Properties();
        }
        //нормализированный путь запроса (без query и без префикса скрипта)
        String path = resolvePath(env);
        //парсим QUERY_STRING в Map<String, List<String>> (поддержка повторяющихся парамов)
        Map<String, List<String>> params = parseQuery(trimToEmpty(env.getProperty("QUERY_STRING")));
        //единственный эндпоинт
        if (path.equals("/check")) {
            long started = System.nanoTime(); // замер времени старта обработки запроса (
            List<String> rawXs = params.getOrDefault("checkX", Collections.emptyList()); // собираем все значения X (может быть несколько)
            if (rawXs.isEmpty()) { // X обязателен
                respond("400 Bad Request", "text/plain; charset=utf-8", "At least one X value is required\n");
                return;
            }
            List<Integer> parsedXs = new ArrayList<>(rawXs.size()); // парсим X в целые числа и проверяем диапазон [-4;4]
            for (String rawX : rawXs) {
                Integer parsed = getIntegerParam(rawX);
                if (parsed == null) {
                    return;
                }
                if (parsed < -4 || parsed > 4) {
                    respond("400 Bad Request", "text/plain; charset=utf-8", "The param should be in range [-4 ; 4]\n");
                    return;
                }
                parsedXs.add(parsed);
            }
            // собираем Y (ровно одно значение)
            List<String> rawYs = params.getOrDefault("checkY", Collections.emptyList());
            if (rawYs.isEmpty()) {
                respond("400 Bad Request", "text/plain; charset=utf-8", "Y param cannot be empty\n");
                return;
            }
            if (rawYs.size() > 1) { // запрещаем несколько Y одновременно
                respond("400 Bad Request", "text/plain; charset=utf-8", "Only one Y value is supported\n");
                return;
            }
            // берём единственное Y (как строку)
            String rawY = rawYs.get(0);
            BigDecimal y = getDecimalParam(rawY, "Y"); // парсим Y как BigDecimal с поддержкой запятой
            if (y == null) {
                return;
            }
            if (y.compareTo(MIN_Y) < 0 || y.compareTo(MAX_Y) > 0) { // проверка диапазона Y входит в [-5;5]
                respond("400 Bad Request", "text/plain; charset=utf-8", "The param should be in range [-5 ; 5]\n");
                return;
            }
            // собираем все значения R (может быть несколько)
            List<String> rawRs = params.getOrDefault("checkR", Collections.emptyList());
            if (rawRs.isEmpty()) {
                respond("400 Bad Request", "text/plain; charset=utf-8", "At least one R value is required\n");
                return;
            }
            // парсим R как BigDecimal и валидируем по ALLOWED_R
            List<BigDecimal> parsedRs = new ArrayList<>(rawRs.size());
            for (String rawR : rawRs) {
                BigDecimal parsed = getDecimalParam(rawR, "R");
                if (parsed == null) {
                    return;
                }
                if (!isAllowedR(parsed)) {
                    respond("400 Bad Request", "text/plain; charset=utf-8", "The param should be in range {1; 1.5 (1,5); 2; 2.5 (2,5); 3;}\n");
                    return;
                }
                parsedRs.add(parsed);
            }
            // генерируем все комбинации (X × R) с одним Y и считаем попадание
            List<HistoryEntry> newEntries = new ArrayList<>(parsedXs.size() * parsedRs.size());
            for (int xi = 0; xi < parsedXs.size(); xi++) {
                Integer x = parsedXs.get(xi); //текущий X (Integer)
                String rawX = rawXs.get(xi);  // оригинальная строка X (как пришла в запросе)
                BigDecimal bigX = BigDecimal.valueOf(x);  // x как bigdecimal чтоб точные расчёты
                for (int ri = 0; ri < parsedRs.size(); ri++) {
                    BigDecimal r = parsedRs.get(ri); //текущий R
                    String rawR = rawRs.get(ri); // оригинальная строка R

                    boolean hit; //принадлежность графику из трёх фигур
                    if (y.compareTo(BigDecimal.ZERO) >= 0 // I четверть (0<=x<=r и 0<=y<=r)
                            && bigX.compareTo(BigDecimal.ZERO) >= 0
                            && y.compareTo(r) <= 0
                            && bigX.compareTo(r) <= 0) {
                        hit = true;
                    } else if (y.compareTo(BigDecimal.ZERO) <= 0 // III четверть (x<=0 и y<=0 и y + x >= -r/2)
                            && bigX.compareTo(BigDecimal.ZERO) <= 0
                            && y.add(bigX, MC).compareTo(r.divide(TWO, MC).negate()) >= 0) {
                        hit = true;
                    } else if (y.compareTo(BigDecimal.ZERO) <= 0 // IV четверть x>=0 и y=<0 и x^2 + y^2 =< (r^2)/4
                            && bigX.compareTo(BigDecimal.ZERO) >= 0) {
                        BigDecimal ySquared = y.multiply(y, MC);
                        BigDecimal xSquared = bigX.multiply(bigX, MC);
                        BigDecimal radiusQuarterSquared = r.multiply(r, MC).divide(FOUR, MC);
                        hit = ySquared.add(xSquared, MC).compareTo(radiusQuarterSquared) <= 0;
                    } else { //иначе - промах
                        hit = false;
                    }

                    BigDecimal elapsedMs = new BigDecimal(System.nanoTime() - started) //время выполнения запроса в миллисекундах (3 знака после запятой)
                            .divide(NANOS_IN_MILLI, 3, RoundingMode.HALF_UP);
                    String now = OffsetDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME); //текущее время в исо 8601 с часовым поясом

                    HistoryEntry entry = new HistoryEntry( //формируем запись истории (x/y/r - в виде строк)
                            coalesce(rawX, formatInteger(x)), //отдаем исходную строку X (если была)
                            coalesce(rawY, formatDecimal(y)), //исходный Y (или отформатированное)
                            coalesce(rawR, formatDecimal(r)), //исходный R (или отформатированное)
                            hit,
                            now,
                            elapsedMs
                    );
                    newEntries.add(entry); //добавляем в список новые записи (для ответа)
                }
            }

            if (newEntries.isEmpty()) { //если комбинаций нет - ошибка
                respond("400 Bad Request", "text/plain; charset=utf-8", "No point combinations to process\n");
                return;
            }

            List<HistoryEntry> snapshot; //обновляем глобальную history безопасно для потоков
            synchronized (HISTORY) {
                for (int i = newEntries.size() - 1; i >= 0; i--) { //добавляем новые записи в начало (сохраняем порядок запроса)
                    HISTORY.add(0, newEntries.get(i));
                }
                while (HISTORY.size() > HISTORY_LIMIT) { //обрезаем историю до лимита
                    HISTORY.remove(HISTORY.size() - 1);
                }
                snapshot = new ArrayList<>(HISTORY); //делаем снимок списка для ответа (чтоб без synchronized)
            }

            String body = buildResponseJson(true, newEntries, snapshot); //собираем json -> шлем 200 ок
            respond("200 OK", "application/json; charset=utf-8", body);
        }
        else { //неизвестный путь 404
            respond("404 Not Found", "text/plain; charset=utf-8", "not found\n");
        }
    }
    //парсинг десятичного параметра
    private static BigDecimal getDecimalParam(String param, String name) {
        if (param == null) {
            respond("400 Bad Request", "text/plain; charset=utf-8", name + " param cannot be empty\n");
            return null;
        }
        String normalized = param.trim().replace(',', '.');
        if (normalized.isEmpty()) {
            respond("400 Bad Request", "text/plain; charset=utf-8", name + " param cannot be empty\n");
            return null;
        }
        try {
            return new BigDecimal(normalized);
        } catch (NumberFormatException e) {
            respond("400 Bad Request", "text/plain; charset=utf-8", name + " param should be a decimal number\n");
            return null;
        }
    }
    //парсинг целого параметра X
    private static Integer getIntegerParam(String param) {
        if (param == null) {
            respond("400 Bad Request", "text/plain; charset=utf-8", "The param cannot be empty\n");
            return null;
        }
        try {
            Integer y = Integer.parseInt(param);
            return y;
        }
        catch (NumberFormatException e) {
            respond("400 Bad Request", "text/plain; charset=utf-8", "The param should be an Integer number\n");
        }
        return null;
    }
//проверка что R входит в разрешенный диапазон
    private static boolean isAllowedR(BigDecimal value) {
        for (BigDecimal allowed : ALLOWED_R) {
            if (value.compareTo(allowed) == 0) {
                return true;
            }
        }
        return false;
    }
//нормализация пути REQUEST_URI без query и срезаем SCRIPT_NAME
    private static String resolvePath(Properties env) {
        String path = trimToEmpty(env.getProperty("PATH_INFO"));
        if (path.isEmpty()) {
            path = trimToEmpty(env.getProperty("REQUEST_URI"));
            if (!path.isEmpty()) {
                int queryIndex = path.indexOf('?');
                if (queryIndex >= 0) {
                    path = path.substring(0, queryIndex);
                }
                String scriptName = trimToEmpty(env.getProperty("SCRIPT_NAME"));
                if (!scriptName.isEmpty() && path.startsWith(scriptName)) {
                    path = path.substring(scriptName.length());
                }
            }
        }
        if (path.isEmpty()) {
            return "/";
        }
        return path.startsWith("/") ? path : "/" + path;
    }
    //  обрезка пробелов
    private static String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }
    //парсинг QUERY_STRING в Map<key, List<value>>
    private static Map<String, List<String>> parseQuery(String query) {
        Map<String, List<String>> result = new LinkedHashMap<>();
        if (query.isEmpty()) {
            return result;
        }

        String[] pairs = query.split("&");
        for (String pair : pairs) {
            if (pair.isEmpty()) {
                continue;
            }
            String key;
            String value;
            int equalsIndex = pair.indexOf('=');
            if (equalsIndex >= 0) {
                key = pair.substring(0, equalsIndex);
                value = pair.substring(equalsIndex + 1);
            } else {
                key = pair;
                value = "";
            }
            try {
                key = URLDecoder.decode(key, "UTF-8");
                value = URLDecoder.decode(value, "UTF-8");
            } catch (IllegalArgumentException | UnsupportedEncodingException ignore) { //игнор битых кодировок
            }
            result.computeIfAbsent(key, k -> new ArrayList<>()).add(value); //поддержка повторяющихся ключей
        }
        return result;
    }

    private static void respond(String status, String contentType, String body) { //формирование http-ответа FastCGI: заголовки и тело
        System.out.println("Status: " + status);
        System.out.println("Content-Type: " + contentType);
        System.out.println("Access-Control-Allow-Origin: *");
        System.out.println();
        System.out.print(body);
        System.out.flush();
    }
    // форматирование BigDecimal без лишних нулей/экспоненты
    private static String formatDecimal(BigDecimal value) {
        if (value == null) {
            return "";
        }
        return value.stripTrailingZeros().toPlainString();
    }
    //формирование целого (null -> "")
    private static String formatInteger(Integer value) {
        return value == null ? "" : Integer.toString(value);
    }
    // взять value, иначе fallback (если пусто/пробелы)
    private static String coalesce(String value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }
    //сборка ответа json
    private static String buildResponseJson(boolean ok, List<HistoryEntry> points, List<HistoryEntry> history) {
        StringBuilder sb = new StringBuilder();
        sb.append('{');
        sb.append("\"ok\":").append(ok);
        sb.append(",\"points\":[");
        if (points != null) {
            for (int i = 0; i < points.size(); i++) {
                if (i > 0) {
                    sb.append(',');
                }
                sb.append(historyEntryToJson(points.get(i)));
            }
        }
        sb.append(']');
        sb.append(",\"history\":[");
        for (int i = 0; i < history.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(historyEntryToJson(history.get(i)));
        }
        sb.append(']');
        sb.append('}');
        return sb.toString();
    }
    //сериализация одной записи истории в json объкет (строкой)
    private static String historyEntryToJson(HistoryEntry entry) {
        StringBuilder sb = new StringBuilder();
        sb.append('{');
        sb.append("\"x\":\"").append(jsonEscape(entry.x)).append('"');
        sb.append(",\"y\":\"").append(jsonEscape(entry.y)).append('"');
        sb.append(",\"r\":\"").append(jsonEscape(entry.r)).append('"');
        sb.append(",\"hit\":").append(entry.hit);
        sb.append(",\"now\":\"").append(jsonEscape(entry.now)).append('"');
        sb.append(",\"elapsed_ms\":").append(entry.elapsedMs.stripTrailingZeros().toPlainString());
        sb.append('}');
        return sb.toString();
    }
    //экранирование строк для безопасной вставки в json
    private static String jsonEscape(String value) {
        if (value == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < 0x20) {
                        sb.append(String.format("\\u%04x", (int) ch));
                    } else {
                        sb.append(ch);
                    }
            }
        }
        return sb.toString();
    }
    //внутренняя неизменяемая запись истории
    private static final class HistoryEntry {
        //поля храним как строки (как были у пользователя), время / длительность отдельно
        private final String x;
        private final String y;
        private final String r;
        private final boolean hit;
        private final String now;
        private final BigDecimal elapsedMs;
        //конструктор записи истории (все поля заполняются при создании)
        private HistoryEntry(String x, String y, String r, boolean hit, String now, BigDecimal elapsedMs) {
            this.x = x;
            this.y = y;
            this.r = r;
            this.hit = hit;
            this.now = now;
            this.elapsedMs = elapsedMs;
        }
    }
}
