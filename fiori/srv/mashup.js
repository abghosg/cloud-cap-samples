////////////////////////////////////////////////////////////////////////////
//
//    Mashing up provided and required services...
//
module.exports = async()=>{ // called by server.js

  const cds = require('@sap/cds')
  const CatalogService = await cds.connect.to ('CatalogService')
  const ReviewsService = await cds.connect.to ('ReviewsService')
  const OrdersService = await cds.connect.to ('OrdersService')
  const db = await cds.connect.to ('db')

  // reflect entity definitions used below...
  const { Books } = db.entities ('sap.capire.bookshop')

  //
  // Delegate requests to read reviews to the ReviewsService
  // Note: prepend is neccessary to intercept generic default handler
  //
  CatalogService.prepend (srv => srv.on ('READ', 'Books/reviews', (req) => {
    console.debug ('> delegating request to ReviewsService')
    const [id] = req.params, { columns, limit } = req.query.SELECT
    return ReviewsService.read ('Reviews',columns).limit(limit).where({subject:String(id)})
  }))

  //
  // Create an order with the OrdersService when CatalogService signals a new order
  //
  CatalogService.on ('OrderedBook', async (msg) => {
    const { book, amount, buyer } = msg.data
    const { title, price } = await SELECT.from (Books, book, b => { b.title, b.price })
    return OrdersService.create ('Orders').entries({
      OrderNo: 'Order at '+ (new Date).toLocaleString(),
      Items: [{ product:{ID:`${book}`}, title, price, amount }],
      buyer, createdBy: buyer
    })
  })

  //
  // Update Books' average ratings when ReviewsService signals updatd reviews
  //
  ReviewsService.on ('reviewed', (msg) => {
    console.debug ('> received:', msg.event, msg.data)
    const { subject, rating } = msg.data
    return UPDATE(Books,subject).with({rating})
  })

  //
  // Reduce stock of ordered books for orders are created from Orders admin UI
  //
  OrdersService.on ('OrderChanged', (msg) => {
    console.debug ('> received:', msg.event, msg.data)
    const { product, deltaAmount } = msg.data
    return UPDATE (Books) .where ('ID =', product)
    .and ('stock >=', deltaAmount)
    .set ('stock -=', deltaAmount)
  })
}
