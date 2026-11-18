<?php
declare(strict_types=1);

function advisorGreeting(string $name): string {
    return '¡Hola! Soy tu asesor empresarial de RYYCO' . ($name !== '' ? ' para ' . $name : '') . '. Estoy aquí para ayudarte a analizar las ventas, conocer el rendimiento de tus productos y encontrar oportunidades para hacer crecer tu restaurante. ¿Qué te gustaría analizar hoy?';
}
function advisorNumeric($v): bool { return (is_int($v) || is_float($v)) && is_finite((float)$v) && $v >= 0; }
function advisorDate($value): ?DateTimeImmutable {
    if (!is_string($value) || $value === '') return null;
    try { return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('America/Bogota')); } catch (Throwable $e) { return null; }
}
function advisorMetrics(string $uid, array $profile, array $rawOrders, array $rawProducts, ?DateTimeImmutable $now = null): array {
    $now = ($now ?? new DateTimeImmutable())->setTimezone(new DateTimeZone('America/Bogota'));
    $orders = [];
    foreach ($rawOrders as $o) if (($o['storeOwnerId'] ?? '') === $uid) $orders[$o['id']] = $o;
    $products = array_values(array_filter($rawProducts, fn($p) => ($p['userId'] ?? '') === $uid));
    $valid = array_values(array_filter($orders, fn($o) => in_array($o['status'] ?? '', ['pending','confirmed','preparing','ready','picked_up','delivering','delivered','processing','shipped'], true)));
    $sales = array_values(array_filter($valid, fn($o) => advisorNumeric($o['totalAmount'] ?? null)));
    $today = $now->setTime(0,0); $tomorrow = $today->modify('+1 day');
    $week = $today->modify('-' . ((int)$today->format('N') - 1) . ' days');
    $month = $today->modify('first day of this month');
    $period = function($start, $end) use ($sales, $now) {
        $rows = array_filter($sales, function($o) use ($start, $end, $now) { $d = advisorDate($o['createdAt'] ?? null); return $d && $d >= $start && $d < $end && $d <= $now; });
        $sum = array_sum(array_column($rows, 'totalAmount'));
        return ['start'=>$start->format('Y-m-d'), 'endExclusive'=>$end->format('Y-m-d'), 'sales'=>$sum, 'orders'=>count($rows), 'ticket'=>count($rows) ? $sum/count($rows) : null];
    };
    $items = [];
    foreach ($products as $p) $items[$p['id']] = ['name'=>substr((string)($p['name'] ?? 'Producto'),0,120), 'quantity'=>0, 'revenue'=>0];
    foreach ($valid as $o) foreach (is_array($o['items'] ?? null) ? $o['items'] : [] as $i) {
        if (!advisorNumeric($i['quantity'] ?? null) || $i['quantity'] < 1 || floor($i['quantity']) != $i['quantity'] || !advisorNumeric($i['price'] ?? null)) continue;
        $key = $i['productId'] ?? ('name:' . ($i['name'] ?? 'Producto'));
        $item = $items[$key] ?? ['name'=>substr((string)($i['name'] ?? 'Producto'),0,120), 'quantity'=>0, 'revenue'=>0];
        $item['quantity'] += $i['quantity']; $item['revenue'] += $i['price'] * $i['quantity']; $items[$key] = $item;
    }
    $top = array_values(array_filter($items, fn($i)=>$i['quantity']>0)); usort($top, fn($a,$b)=>($b['quantity']<=>$a['quantity']) ?: ($b['revenue']<=>$a['revenue']));
    $revenue = $top; usort($revenue, fn($a,$b)=>$b['revenue']<=>$a['revenue']);
    $least = array_values($items); usort($least, fn($a,$b)=>($a['quantity']<=>$b['quantity']) ?: ($a['revenue']<=>$b['revenue']));
    $hours = [];
    foreach ($sales as $o) {
        $date = advisorDate($o['createdAt'] ?? null); if (!$date || $date > $now) continue;
        $h = (int)$date->format('G'); $hours[$h] ??= ['hour'=>$h, 'orders'=>0, 'sales'=>0]; $hours[$h]['orders']++; $hours[$h]['sales'] += $o['totalAmount'];
    }
    $hours = array_values($hours); usort($hours, fn($a,$b)=>($b['sales']<=>$a['sales']) ?: ($b['orders']<=>$a['orders']) ?: ($a['hour']<=>$b['hour']));
    $duration = function($field) use ($valid) { $rows = array_filter($valid, fn($o)=>advisorNumeric($o[$field] ?? null) && $o[$field]>0); return count($rows) ? array_sum(array_column($rows,$field))/count($rows)/60 : null; };
    $stock = array_values(array_filter($products, fn($p)=>advisorNumeric($p['stock'] ?? null)));
    $total = array_sum(array_column($sales,'totalAmount'));
    $customers=[];
    foreach ($valid as $o) { $phone=preg_replace('/\D/','',(string)($o['customerPhone']??'')); $phone=preg_replace('/^57(?=\d{10}$)/','',$phone);
        if (strlen($phone)>=7) $customers[$phone]=($customers[$phone]??0)+1; }
    return [
        'storeName'=>substr((string)($profile['displayName'] ?? $profile['username'] ?? 'Mi restaurante'),0,120),
        'checkedAt'=>$now->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z'), 'timezone'=>'America/Bogota',
        'basis'=>'Totales registrados de pedidos no cancelados, incluidos pendientes y cargos de domicilio/recipientes si forman parte de totalAmount. No son pagos confirmados ni utilidad. Fechas según creación del pedido. Productos por precio unitario guardado, sin atribuir cargos generales. Histórico conservado en Firebase.',
        'totalSales'=>$total, 'totalOrders'=>count($orders), 'validOrders'=>count($sales), 'averageTicket'=>count($sales)?$total/count($sales):null,
        'pendingCount'=>count(array_filter($valid,fn($o)=>in_array($o['status'],['pending','processing','confirmed','preparing','ready'],true))),
        'cancelledCount'=>count(array_filter($orders,fn($o)=>($o['status']??'')==='cancelled')),
        'missingAmounts'=>count($valid)-count($sales), 'missingDates'=>count(array_filter($valid,fn($o)=>!advisorDate($o['createdAt']??null))),
        'today'=>$period($today,$tomorrow), 'yesterday'=>$period($today->modify('-1 day'),$today),
        'week'=>$period($week,$tomorrow), 'previousWeek'=>$period($week->modify('-7 days'),$week),
        'month'=>$period($month,$tomorrow), 'previousMonth'=>$period($month->modify('-1 month'),$month),
        'topProducts'=>array_slice($top,0,5), 'topRevenueProducts'=>array_slice($revenue,0,5), 'leastProducts'=>array_slice($least,0,5), 'peakHours'=>array_slice($hours,0,3),
        'averagePrepMinutes'=>$duration('processingDuration'), 'averageDeliveryMinutes'=>$duration('totalDuration'),
        'lowStock'=>array_slice(array_map(fn($p)=>['name'=>substr((string)($p['name']??'Producto'),0,120),'stock'=>$p['stock']], array_values(array_filter($stock,fn($p)=>$p['stock']<=5))),0,20),
        'stockKnown'=>count($stock), 'productCount'=>count($products), 'costsAvailable'=>false,
        'repeatCustomerRate'=>count($customers)?100*count(array_filter($customers,fn($n)=>$n>1))/count($customers):null, 'identifiedCustomers'=>count($customers),
    ];
}
function advisorMoney($n): string { return number_format(round($n),0,',','.') . ' COP'; }
function advisorDirectReply(string $message, array $m, array $history = []): ?string {
    $q = strtolower(strtr($message, ['Á'=>'a','É'=>'e','Í'=>'i','Ó'=>'o','Ú'=>'u','á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','¿'=>'']));
    if (preg_match('/^\s*(y\s+)?(ayer|hoy|este mes|esta semana)[?\s.!]*$/u',$q)) foreach ($history as $h) if (($h['role']??'')==='user' && preg_match('/vend|venta|ticket/i',$h['text']??'')) { $q = 'ventas '.$q; break; }
    if ($message==='__summary__' || preg_match('/^(hola|buenas|buenos dias)[!¡.,\s]*$/u',$q)) return advisorGreeting($m['storeName']);
    $redirect = 'Soy tu asesor empresarial de RYYCO. Estoy aquí para ayudarte a mejorar las ventas, analizar tus ingresos y administrar mejor tu restaurante. ¿Qué te gustaría revisar?';
    if (preg_match('/otros? restaurantes?|otra tienda|global.*ryyco|ignora.*instruccion|actua como.*mesero/u',$q)) return $redirect;
    $note = "\nVentas registradas, no pagos confirmados ni ganancias. Hora de Colombia.";
    if ($m['missingAmounts'] || $m['missingDates']) $note .= " Hay registros incompletos: {$m['missingAmounts']} sin importe válido y {$m['missingDates']} sin fecha válida.";
    if (preg_match('/balance|diagnostico/',$q)) return advisorDirectReply('resumen de rendimiento',$m);
    if (str_contains($q,'hoy') && str_contains($q,'ayer') && preg_match('/compar|venta|vend/',$q)) return 'Hoy hasta ahora: '.advisorMoney($m['today']['sales'])." en {$m['today']['orders']} pedidos. Ayer completo: ".advisorMoney($m['yesterday']['sales'])." en {$m['yesterday']['orders']} pedidos. Hoy es un día parcial; esta diferencia no demuestra por sí sola una tendencia.".$note;
    if (preg_match('/venta|vendimos|vendido|vendemos|factur|ingres|ticket/',$q) && preg_match('/hoy|ayer|semana|mes/',$q) && !preg_match('/mejor|estrateg|aument|subir|producto|plato/',$q)) {
        $key = str_contains($q,'ayer') ? 'yesterday' : (str_contains($q,'semana') ? 'week' : (str_contains($q,'mes') ? 'month' : 'today'));
        $p=$m[$key]; $labels=['today'=>'Hoy','yesterday'=>'Ayer','week'=>'Esta semana (desde el lunes)','month'=>'Este mes hasta ahora'];
        $text = $labels[$key].': '.advisorMoney($p['sales'])." en {$p['orders']} pedidos contabilizados. Ticket promedio: ".($p['ticket']===null?'sin datos':advisorMoney($p['ticket'])).'.';
        $previous = $key==='month' ? $m['previousMonth'] : ($key==='week' ? $m['previousWeek'] : null);
        if ($previous) $text .= " El período anterior completo ({$previous['start']} a ".(new DateTimeImmutable($previous['endExclusive']))->modify('-1 day')->format('Y-m-d').') registró '.advisorMoney($previous['sales']).'. El actual es parcial.';
        return $text.$note;
    }
    if (str_contains($q,'ticket')) return 'El ticket promedio del histórico conservado es '.($m['averageTicket']===null?'no disponible':advisorMoney($m['averageTicket'])).", sobre {$m['validOrders']} pedidos con importe válido.".$note;
    if (preg_match('/producto|plato/',$q) && preg_match('/vend|estrella|factur|ingres|menos/',$q)) {
        if (preg_match('/estrella|mas vendidos/',$q) && preg_match('/menos|no se venden/',$q)) return advisorDirectReply('productos más vendidos',$m)."\n\nMenor rotación:\n".advisorDirectReply('productos menos vendidos',$m);
        $list = preg_match('/menos|no se venden/',$q) ? $m['leastProducts'] : (preg_match('/factur|ingres|genera.*venta/',$q) ? $m['topRevenueProducts'] : $m['topProducts']);
        $lines=[]; foreach ($list as $i=>$p) $lines[] = ($i+1).". {$p['name']}: {$p['quantity']} unidades; ".advisorMoney($p['revenue']).' en líneas de producto.';
        return ($lines ? "Según el histórico conservado:\n".implode("\n",$lines) : 'No hay productos vendidos verificables en el histórico disponible.').$note;
    }
    if (preg_match('/horario|hora|demanda/',$q)) return $m['peakHours'] ? "Horarios de mayor facturación (America/Bogota), según el histórico:\n".implode("\n",array_map(fn($h)=>"{$h['hour']}:00–{$h['hour']}:59: ".advisorMoney($h['sales']).", {$h['orders']} pedidos.",$m['peakHours'])).$note : 'No hay pedidos con fecha e importe suficientes para identificar horas de mayor venta.';
    if (preg_match('/cocina|prepar|tiempo|eficiencia/',$q)) return 'Preparación promedio: '.($m['averagePrepMinutes']===null?'sin mediciones suficientes':number_format($m['averagePrepMinutes'],1).' minutos').'. Tiempo total promedio: '.($m['averageDeliveryMinutes']===null?'sin mediciones suficientes':number_format($m['averageDeliveryMinutes'],1).' minutos').'. Solo se utilizan duraciones registradas en pedidos no cancelados.';
    if (preg_match('/stock|inventario|agotado/',$q)) return "Inventario informado en {$m['stockKnown']} de {$m['productCount']} productos. ".($m['lowStock'] ? 'Stock bajo: '.implode('; ',array_map(fn($p)=>"{$p['name']}: {$p['stock']}",$m['lowStock'])).'.' : 'No hay alertas en los productos con stock registrado; los demás no se pueden evaluar.');
    if (preg_match('/recompra|retencion|cliente/',$q)) return $m['repeatCustomerRate']===null ? 'No hay suficientes clientes identificables para calcular recompra.' : 'La tasa de recompra es '.number_format($m['repeatCustomerRate'],1)."%, entre {$m['identifiedCustomers']} clientes identificables por teléfono en pedidos no cancelados. No se incluyen clientes sin un identificador válido.";
    if (preg_match('/costo|ganancia|utilidad|rentabilidad|margen/',$q)) return 'No dispongo de costos históricos de insumos, gastos e impuestos verificables para calcular utilidad o margen. Las ventas registradas no son ganancias. Registra esos costos para poder comparar ingresos y egresos.';
    if (preg_match('/mejor|estrateg|aument|crecer|subir/',$q)) return "Para {$m['storeName']}, estas son hipótesis a probar, no resultados garantizados:\n1. ".(!empty($m['topProducts']) ? "Promociona {$m['topProducts'][0]['name']}, con {$m['topProducts'][0]['quantity']} unidades registradas, y mide los pedidos adicionales." : 'Registra pedidos para detectar qué productos tienen demanda.')."\n2. ".(!empty($m['peakHours']) ? "Organiza capacidad de cocina alrededor de las {$m['peakHours'][0]['hour']}:00, tu franja de mayor facturación registrada." : 'Mide ventas por hora antes de elegir una promoción.')."\n3. Prueba una oferta complementaria y compara el ticket promedio y el costo real; no apliques descuentos sin conocer el margen.";
    if (preg_match('/rendimiento|balance|diagnostico|resumen/',$q)) return "{$m['storeName']}: ".advisorMoney($m['totalSales'])." registrados en {$m['validOrders']} pedidos; ticket promedio ".($m['averageTicket']===null?'sin datos':advisorMoney($m['averageTicket'])).'. Hoy: '.advisorMoney($m['today']['sales']).". Pendientes: {$m['pendingCount']}; cancelados: {$m['cancelledCount']}. ".(!empty($m['topProducts']) ? "Producto líder por unidades: {$m['topProducts'][0]['name']}." : 'Todavía no hay un producto líder verificable.').$note;
    if (!preg_match('/negocio|restaurante|venta|pedido|producto|cliente|retencion|recompra|comercial|promocion|marketing|compar|tendencia|factur|ingres/',$q)) return $redirect;
    return null;
}
