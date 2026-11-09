import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Customer, CustomerCreditMovement, CustomerCreditMovementType, SalePayment } from '../entities';

export function money(value: number | string | null | undefined): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

export async function recordCreditMovement(
  manager: EntityManager,
  input: {
    customerId: string;
    saleId?: string | null;
    paymentId?: string | null;
    amount: number;
    type: CustomerCreditMovementType;
  },
): Promise<void> {
  const amount = money(input.amount);
  if (amount <= 0) return;

  const customer = await manager.findOne(Customer, {
    where: { id: input.customerId },
    lock: { mode: 'pessimistic_write' },
  });

  if (!customer) {
    throw new BadRequestException('El cliente no existe');
  }

  const balance = money(customer.creditBalance);
  if (input.type === CustomerCreditMovementType.APPLIED && balance + 0.009 < amount) {
    throw new BadRequestException(`El saldo a favor disponible es Q${balance.toFixed(2)}`);
  }

  customer.creditBalance =
    input.type === CustomerCreditMovementType.OVERPAYMENT ? money(balance + amount) : money(balance - amount);
  await manager.save(customer);

  await manager.save(
    manager.create(CustomerCreditMovement, {
      customer: { id: customer.id },
      sale: input.saleId ? { id: input.saleId } : null,
      payment: input.paymentId ? { id: input.paymentId } : null,
      type: input.type,
      amount,
    }),
  );
}

export async function reverseCreditForPayment(manager: EntityManager, paymentId: string): Promise<void> {
  const movements = await manager.find(CustomerCreditMovement, {
    where: { payment: { id: paymentId } },
    relations: ['customer'],
  });

  for (const movement of movements) {
    const customer = await manager.findOne(Customer, {
      where: { id: movement.customer.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!customer) continue;

    const balance = money(customer.creditBalance);
    const amount = money(movement.amount);
    if (movement.type === CustomerCreditMovementType.OVERPAYMENT) {
      if (balance + 0.009 < amount) {
        throw new BadRequestException('No se puede anular: el saldo a favor de este pago ya fue usado');
      }
      customer.creditBalance = money(balance - amount);
    } else {
      customer.creditBalance = money(balance + amount);
    }
    await manager.save(customer);
    await manager.softRemove(movement);
  }
}

export async function settleTenderedPayments(
  manager: EntityManager,
  saleId: string,
  customerId: string | null | undefined,
  total: number,
  payments: SalePayment[],
  guestExcess: 'change' | 'reject',
): Promise<{ paidAmount: number; pendingAmount: number }> {
  const invoiceTotal = money(total);
  const tendered = money(payments.reduce((sum, payment) => sum + money(payment.amount), 0));

  if (tendered <= invoiceTotal + 0.009) {
    return { paidAmount: tendered, pendingAmount: money(invoiceTotal - tendered) };
  }

  const excess = money(tendered - invoiceTotal);
  if (!customerId) {
    if (guestExcess === 'reject') {
      throw new BadRequestException(`El monto excede el saldo pendiente de Q${invoiceTotal.toFixed(2)}`);
    }

    let remaining = excess;
    for (let index = payments.length - 1; index >= 0 && remaining > 0.009; index--) {
      const payment = payments[index];
      const portion = Math.min(money(payment.amount), remaining);
      payment.amount = money(money(payment.amount) - portion);
      payment.notes = [payment.notes, `Cambio devuelto Q${portion.toFixed(2)}.`].filter(Boolean).join(' ');
      await manager.save(payment);
      remaining = money(remaining - portion);
    }
    return { paidAmount: invoiceTotal, pendingAmount: 0 };
  }

  let remaining = excess;
  for (let index = payments.length - 1; index >= 0 && remaining > 0.009; index--) {
    const payment = payments[index];
    const portion = Math.min(money(payment.amount), remaining);
    payment.creditedAmount = money(money(payment.creditedAmount) + portion);
    payment.notes = [payment.notes, `Excedente Q${portion.toFixed(2)} a favor del cliente.`].filter(Boolean).join(' ');
    await manager.save(payment);
    await recordCreditMovement(manager, {
      customerId,
      saleId,
      paymentId: payment.id,
      amount: portion,
      type: CustomerCreditMovementType.OVERPAYMENT,
    });
    remaining = money(remaining - portion);
  }

  return { paidAmount: invoiceTotal, pendingAmount: 0 };
}
